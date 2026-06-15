/**
 * routes/calls.js
 * Handles all voice call functionality:
 *   POST /call/outbound    — initiate an outbound call via Twilio
 *   POST /call/incoming    — Twilio Voice Webhook for inbound calls
 *   WS   /call/stream      — Twilio ↔ ElevenLabs bidirectional audio bridge
 */

const router = require("express").Router();
const WebSocket = require("ws");
const twilio = require("twilio");

const PhoneNumber = require("../models/PhoneNumber");
const Agent = require("../models/Agent");
const Conversation = require("../models/Conversation");
const { getSignedUrl, createAgent: createElAgent, updateAgent: updateElAgent, ELEVENLABS_API } = require("../config/elevenlabs");
const { appendDtmfInstructions } = require("../utils/dtmf");

/**
 * Track which ElevenLabs agents have been verified/updated this server session.
 * Prevents redundant PATCH calls on every single call.
 */
const verifiedAgents = new Set();

/* ────────────────────────────────────────────
 * Helper: Ensure agent has a valid ElevenLabs ID
 * Creates one on ElevenLabs if missing, updates config if needed.
 * ──────────────────────────────────────────── */
async function ensureElevenLabsAgent(agent) {
  const voiceId = agent.voice_id || "iP95p4xoKVk53GoZ742B";

  const prompt = appendDtmfInstructions(
    agent.system_prompt ||
    agent.conversation_config?.conversation?.system_prompt ||
    "You are a helpful AI assistant."
  );

  // Full agent config — used for both create and update
  const agentConfig = {
    conversation_config: {
      agent: {
        prompt: {
          prompt,
          llm: agent.llm_model || "llama-3.3-70b-versatile",
          temperature: agent.temperature ?? 0.7,
          max_tokens: agent.max_tokens > 0 ? agent.max_tokens : undefined,
        },
        first_message: agent.first_message || "Hello! How can I help you today?",
        language: agent.language || "en",
      },
      asr: {
        quality: "high",
        provider: agent.asr_provider || "elevenlabs",
        user_input_audio_format: "ulaw_8000",
      },
      tts: {
        model_id: "eleven_multilingual_v2",
        voice_id: voiceId,
        agent_output_audio_format: "ulaw_8000",
        stability: agent.stability ?? 0.4,
        similarity_boost: agent.similarity_boost ?? 0.85,
        style: agent.style ?? 0.3,
        use_speaker_boost: true,
        optimize_streaming_latency: 3,
      },
      turn: {
        turn_timeout: agent.turn_timeout ?? 1.2,
        mode: "turn",
      },
      conversation: { max_duration_seconds: agent.max_duration_seconds ?? 600 },
    },
  };

  // If we already have an ID, verify it and ensure config is up-to-date
  if (agent.elevenlabs_agent_id) {
    try {
      await getSignedUrl(agent.elevenlabs_agent_id);

      // Agent exists — update its config ONCE per server session to ensure
      // audio format (ulaw_8000) and DTMF instructions are correct.
      // Without this, stale agents with wrong audio format silently fail:
      // the first_message plays (pre-configured) but user audio is never understood.
      if (!verifiedAgents.has(agent.elevenlabs_agent_id)) {
        console.log(`🔄 Updating ElevenLabs agent config: ${agent.elevenlabs_agent_id}`);
        try {
          await updateElAgent(agent.elevenlabs_agent_id, agentConfig);
          verifiedAgents.add(agent.elevenlabs_agent_id);
          console.log(`✅ Agent config verified & updated: ${agent.elevenlabs_agent_id}`);
        } catch (updateErr) {
          console.warn(`⚠️  Could not update agent config: ${updateErr.message} — proceeding anyway`);
          verifiedAgents.add(agent.elevenlabs_agent_id); // Don't retry every call
        }
      }

      return agent.elevenlabs_agent_id;
    } catch {
      console.warn(`⚠️  ElevenLabs agent "${agent.elevenlabs_agent_id}" invalid — creating new one`);
      verifiedAgents.delete(agent.elevenlabs_agent_id);
    }
  }

  // Create a brand new ElevenLabs agent with correct config
  const newId = await createElAgent({
    name: agent.name || "Callify Agent",
    ...agentConfig,
  });

  // Persist the new ElevenLabs agent ID to MongoDB
  await Agent.findByIdAndUpdate(agent._id, { elevenlabs_agent_id: newId });
  verifiedAgents.add(newId);
  console.log(`✅ Created ElevenLabs agent for "${agent.name}": ${newId}`);
  return newId;
}

/* ────────────────────────────────────────────
 * POST /call/outbound — initiate an outbound Twilio call
 * ──────────────────────────────────────────── */
router.post("/outbound", async (req, res) => {
  try {
    const { agent_id, agent_phone_number_id, to_number } = req.body;

    if (!agent_id || !agent_phone_number_id || !to_number) {
      return res.status(400).json({
        detail: "agent_id, agent_phone_number_id, and to_number are required",
      });
    }

    const [phone, agent] = await Promise.all([
      PhoneNumber.findOne({ phone_number_id: agent_phone_number_id }),
      Agent.findOne({ agent_id }).lean(),
    ]);

    if (!phone) return res.status(404).json({ detail: "Phone number not found" });
    if (!agent) return res.status(404).json({ detail: "Agent not found" });

    // Ensure ElevenLabs agent is ready BEFORE placing the call
    const elevenLabsAgentId = await ensureElevenLabsAgent(agent);

    const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_SECRET } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY_SID || !TWILIO_API_SECRET) {
      return res.status(500).json({ detail: "Twilio credentials not configured in .env" });
    }

    const client = twilio(TWILIO_API_KEY_SID, TWILIO_API_SECRET, { accountSid: TWILIO_ACCOUNT_SID });
    const host = (process.env.PUBLIC_URL || `http://${req.headers.host}`).replace(/^https?:\/\//, "").trim();
    const statusCallback = `https://${host}/call/status`;
    const streamUrl = `wss://${host}/call/stream`;
    console.log(`🔗 Stream URL: ${streamUrl}  (PUBLIC_URL=${process.env.PUBLIC_URL})`);
    const twiml = `<Response><Connect><Stream url="${streamUrl}"><Parameter name="agent_id" value="${agent_id}" /></Stream></Connect><Pause length="120"/><Say>The call has ended. Goodbye.</Say></Response>`;

    const call = await client.calls.create({ 
      twiml, 
      to: to_number, 
      from: phone.phone_number,
      statusCallback,
      statusCallbackEvent: ['completed', 'failed', 'busy', 'no-answer']
    });

    // Create a new Conversation record
    await Conversation.create({
      id: call.sid,
      agent: agent.name || agent.agent_id,
      duration: "0:00",
      messages: 0,
      evaluation: "In Progress",
      client: { phone: to_number }
    });

    console.log(`📞 Outbound call: ${call.sid} → ${to_number} (EL: ${elevenLabsAgentId})`);
    res.json({ call_id: call.sid, status: call.status, agent_id, to_number });
  } catch (err) {
    console.error("Outbound call error:", err.message);
    res.status(500).json({ detail: err.message });
  }
});

/* ────────────────────────────────────────────
 * POST /call/incoming — Twilio Voice Webhook
 * ──────────────────────────────────────────── */
router.post("/incoming", async (req, res) => {
  const host = (process.env.PUBLIC_URL || `http://${req.headers.host}`).replace(/^https?:\/\//, "").trim();

  let agentId = "";
  try {
    const calledNumber = req.body.Called || req.body.To || "";
    console.log(`📞 Incoming call from ${req.body.From || "unknown"} to ${calledNumber}`);
    const phone = await PhoneNumber.findOne({ phone_number: calledNumber }).lean();
    if (phone?.assigned_agent?.agent_id) {
      agentId = phone.assigned_agent.agent_id;
      const agent = await Agent.findOne({ agent_id: agentId }).lean();
      if (agent) {
        await ensureElevenLabsAgent(agent).catch(console.error);
        
        const callSid = req.body.CallSid;
        if (callSid) {
          await Conversation.findOneAndUpdate(
            { id: callSid },
            {
              id: callSid,
              agent: agent.name || agent.agent_id,
              duration: "0:00",
              messages: 0,
              evaluation: "In Progress",
              client: { phone: req.body.From || "" }
            },
            { upsert: true }
          );
        }
      }
    }
  } catch (e) {
    console.error("Error resolving incoming number:", e.message);
  }

  const streamUrl = `wss://${host}/call/stream`;
  console.log(`🔗 Incoming stream URL: ${streamUrl} | agent: ${agentId}`);
  res.type("text/xml").send(
    `<Response><Connect><Stream url="${streamUrl}"><Parameter name="agent_id" value="${agentId}" /></Stream></Connect><Pause length="120"/><Say>The call has ended. Goodbye.</Say></Response>`
  );
});

/* ────────────────────────────────────────────
 * POST /call/status — Twilio Call Status Webhook
 * ──────────────────────────────────────────── */
router.post("/status", async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;
    if (!CallSid) return res.status(400).send("No CallSid");

    let evaluation = "Successful";
    if (["failed", "busy", "no-answer", "canceled"].includes(CallStatus)) {
      evaluation = "Failed";
    }

    // Format duration string
    let durationStr = "0:00";
    if (CallDuration) {
      const d = parseInt(CallDuration);
      const minutes = Math.floor(d / 60);
      const seconds = d % 60;
      durationStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }

    await Conversation.findOneAndUpdate(
      { id: CallSid },
      { 
        $set: { 
          evaluation, 
          duration: durationStr 
        } 
      }
    );
    console.log(`✅ Call ${CallSid} status updated to ${CallStatus} (Duration: ${durationStr})`);
    res.status(200).send("OK");
  } catch (err) {
    console.error("Status Webhook Error:", err.message);
    res.status(500).send("Error");
  }
});

/* ────────────────────────────────────────────
 * WS /call/stream — Twilio ↔ ElevenLabs bridge
 * ──────────────────────────────────────────── */
router.ws("/stream", (ws, _req) => {
  console.log("📞 Twilio WebSocket stream connected");

  let elevenLabsWs = null;
  let streamSid = null;
  let callSid = null;
  let agentIdForReconnect = null;
  let elevenLabsReady = false;
  let audioBuffer = [];
  let audioBufferStartTime = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 8;
  let silenceInterval = null;
  let reconnectTimer = null;
  let lastPongTime = Date.now();
  let heartbeatInterval = null;
  let callEnded = false;

  // ── Audio flow tracking ──
  let audioChunksSent = 0;            // Total audio chunks sent to ElevenLabs
  let audioChunksReceived = 0;        // Total audio chunks received from ElevenLabs
  let lastTranscriptTime = 0;         // Last time we got a user_transcript
  let audioSendStartTime = 0;         // When we started sending audio (for watchdog)

  /* ── Flush buffered audio to ElevenLabs ── */
  function flushAudioBuffer() {
    if (!audioBuffer.length) return;

    // Drop audio that's been buffered too long (> 3 seconds old) — it's stale
    const now = Date.now();
    if (audioBufferStartTime && (now - audioBufferStartTime) > 3000) {
      console.log(`🗑️  Dropping ${audioBuffer.length} stale buffered audio chunks (age: ${now - audioBufferStartTime}ms)`);
      audioBuffer = [];
      audioBufferStartTime = null;
      return;
    }

    console.log(`📤 Flushing ${audioBuffer.length} buffered audio chunks to ElevenLabs`);
    let sent = 0;
    for (const chunk of audioBuffer) {
      if (elevenLabsWs?.readyState === WebSocket.OPEN) {
        try {
          elevenLabsWs.send(JSON.stringify({ user_audio_chunk: chunk }));
          sent++;
          audioChunksSent++;
        } catch (err) {
          console.error(`❌ Failed to flush audio chunk: ${err.message}`);
          break;
        }
      }
    }
    console.log(`📤 Flushed ${sent}/${audioBuffer.length} chunks`);
    audioBuffer = [];
    audioBufferStartTime = null;
  }

  /**
   * Send silence (mulaw 8kHz zero-energy frames) to Twilio so the stream
   * doesn't time out while ElevenLabs is reconnecting.
   */
  function startSilenceKeepAlive() {
    stopSilenceKeepAlive();
    const silencePayload = Buffer.alloc(160, 0xFF).toString("base64");
    silenceInterval = setInterval(() => {
      if (streamSid && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: silencePayload } }));
      }
    }, 200);
  }

  function stopSilenceKeepAlive() {
    if (silenceInterval) {
      clearInterval(silenceInterval);
      silenceInterval = null;
    }
  }

  /**
   * Start heartbeat monitoring — if ElevenLabs doesn't send pings for 15s,
   * assume the connection is dead and force a reconnect.
   */
  function startHeartbeatMonitor() {
    stopHeartbeatMonitor();
    lastPongTime = Date.now();
    heartbeatInterval = setInterval(() => {
      if (!elevenLabsReady) return;
      const elapsed = Date.now() - lastPongTime;
      if (elapsed > 15000) {
        console.log(`💀 ElevenLabs heartbeat timeout (${elapsed}ms since last ping) — forcing reconnect`);
        elevenLabsReady = false;
        if (elevenLabsWs) {
          elevenLabsWs.removeAllListeners();
          try { elevenLabsWs.close(); } catch (_) {}
          elevenLabsWs = null;
        }
        scheduleReconnect("heartbeat timeout");
      }

      // Watchdog: If we've been sending audio for 10+ seconds with no user_transcript,
      // the agent might not be hearing us. Log a warning for debugging.
      if (audioChunksSent > 0 && audioSendStartTime > 0) {
        const sendingFor = Date.now() - audioSendStartTime;
        if (sendingFor > 10000 && lastTranscriptTime === 0) {
          console.warn(`⚠️  WATCHDOG: ${audioChunksSent} audio chunks sent over ${Math.round(sendingFor/1000)}s but NO user_transcript received — ElevenLabs may not be hearing audio!`);
        }
      }
    }, 5000);
  }

  function stopHeartbeatMonitor() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  /**
   * Schedule a reconnect with exponential backoff.
   * Single entry point — handles deduplication internally.
   */
  function scheduleReconnect(reason) {
    if (callEnded) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!agentIdForReconnect) return;
    if (reconnectTimer) {
      console.log(`⏳ Reconnect already scheduled — skipping (${reason})`);
      return;
    }
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`⛔ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up`);
      stopSilenceKeepAlive();
      return;
    }

    reconnectAttempts++;
    const delay = Math.min(500 * Math.pow(2, reconnectAttempts - 1), 8000);
    console.log(`🔄 Reconnecting ElevenLabs in ${delay}ms — attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} (${reason})`);

    startSilenceKeepAlive();

    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      try {
        await connectToElevenLabs(agentIdForReconnect);
      } catch (err) {
        console.error(`❌ Reconnect failed: ${err.message}`);
        scheduleReconnect("previous reconnect failed");
      }
    }, delay);
  }

  /* ── Connect (or reconnect) to ElevenLabs ── */
  async function connectToElevenLabs(agentId) {
    if (callEnded) {
      console.log("🛑 Call ended — aborting ElevenLabs connection");
      return;
    }

    const agent = await Agent.findOne({ agent_id: agentId }).lean();
    if (!agent) { console.error(`❌ Agent not found: ${agentId}`); return; }

    let elevenLabsAgentId;
    try {
      elevenLabsAgentId = await ensureElevenLabsAgent(agent);
    } catch (err) {
      console.error(`❌ Cannot prepare ElevenLabs agent: ${err.message}`);
      throw err;
    }

    let signedUrl;
    try {
      signedUrl = await getSignedUrl(elevenLabsAgentId);
    } catch (err) {
      console.error(`❌ Cannot get signed URL: ${err.message}`);
      throw err;
    }
    console.log(`⚡ Connecting to ElevenLabs agent: ${elevenLabsAgentId}`);

    // Clean up old WebSocket
    if (elevenLabsWs) {
      elevenLabsWs.removeAllListeners();
      if (elevenLabsWs.readyState === WebSocket.OPEN || elevenLabsWs.readyState === WebSocket.CONNECTING) {
        try { elevenLabsWs.close(); } catch (_) {}
      }
      elevenLabsWs = null;
    }
    elevenLabsReady = false;
    audioBuffer = [];
    audioBufferStartTime = null;
    audioChunksSent = 0;
    audioChunksReceived = 0;
    lastTranscriptTime = 0;
    audioSendStartTime = 0;

    elevenLabsWs = new WebSocket(signedUrl);

    elevenLabsWs.on("open", () => {
      console.log("✅ ElevenLabs WebSocket connected");
      reconnectAttempts = 0;

      // IMPORTANT: Send conversation_initiation_client_data WITHOUT overrides.
      // The agent is already configured with correct audio format (ulaw_8000)
      // via ensureElevenLabsAgent(). Sending overrides here can BREAK the audio
      // pipeline — ElevenLabs may not support runtime asr/tts format overrides,
      // causing the agent to silently fail to process user audio.
      elevenLabsWs.send(JSON.stringify({
        type: "conversation_initiation_client_data",
      }));
      console.log("📡 Sent conversation_initiation_client_data");
    });

    elevenLabsWs.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        switch (msg.type) {
          case "audio": {
            const chunk = msg.audio?.chunk || msg.audio_event?.audio_base_64;
            if (chunk && streamSid && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: chunk } }));
              audioChunksReceived++;
              if (audioChunksReceived === 1) {
                console.log("🔊 First audio chunk sent to Twilio — user should hear agent now");
              }
            }
            break;
          }
          case "interruption":
            if (streamSid && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: "clear", streamSid }));
            }
            break;
          case "ping":
            lastPongTime = Date.now();
            if (msg.ping_event?.event_id) {
              if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                try {
                  elevenLabsWs.send(JSON.stringify({ type: "pong", event_id: msg.ping_event.event_id }));
                } catch (err) {
                  console.error(`❌ Failed to send pong: ${err.message}`);
                }
              }
            }
            break;
          case "conversation_initiation_metadata":
            console.log("🟢 ElevenLabs agent is LIVE and READY for audio");
            if (msg.conversation_initiation_metadata_event?.conversation_id) {
              console.log(`   Conversation ID: ${msg.conversation_initiation_metadata_event.conversation_id}`);
            }
            elevenLabsReady = true;
            lastPongTime = Date.now();
            stopSilenceKeepAlive();
            startHeartbeatMonitor();
            flushAudioBuffer();
            break;
          case "agent_response":
            console.log(`🤖 Agent: ${msg.agent_response_event?.agent_response || "(audio)"}`);
            if (callSid) Conversation.updateOne({ id: callSid }, { $inc: { messages: 1 } }).catch(() => {});
            break;
          case "user_transcript":
            console.log(`👤 User: ${msg.user_transcription_event?.user_transcript || "(inaudible)"}`);
            lastTranscriptTime = Date.now();
            if (callSid) Conversation.updateOne({ id: callSid }, { $inc: { messages: 1 } }).catch(() => {});
            break;
          case "conversation_ended":
            console.log("🔔 ElevenLabs conversation ended:", JSON.stringify(msg).slice(0, 300));
            elevenLabsReady = false;
            stopHeartbeatMonitor();
            if (elevenLabsWs) {
              elevenLabsWs.removeAllListeners();
              try { elevenLabsWs.close(); } catch (_) {}
              elevenLabsWs = null;
            }
            scheduleReconnect("conversation_ended");
            break;
          case "error":
            console.error(`❌ ElevenLabs error:`, JSON.stringify(msg).slice(0, 300));
            // Don't immediately close — some errors are non-fatal.
            // The heartbeat monitor will catch truly dead connections.
            break;
          case "internal_tentative_agent_response":
            break;
          default:
            console.log(`🔔 ElevenLabs [${msg.type}]:`, JSON.stringify(msg).slice(0, 150));
        }
      } catch (e) {
        console.error("Error parsing ElevenLabs message:", e.message);
      }
    });

    elevenLabsWs.on("close", (code, reason) => {
      const reasonStr = reason?.toString() || "";
      console.log(`❌ ElevenLabs WS closed (${code}): ${reasonStr}`);
      elevenLabsReady = false;
      stopHeartbeatMonitor();
      scheduleReconnect(`ws_close code=${code}`);
    });

    elevenLabsWs.on("error", (err) => {
      console.error("❌ ElevenLabs WS error:", err.message);
      // Don't set elevenLabsReady=false here for transient errors.
      // The close handler or heartbeat will catch real failures.
    });
  }

  /* ── Handle Twilio events ── */
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.event) {
        case "start":
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          agentIdForReconnect = msg.start.customParameters?.agent_id;
          console.log(`🟢 Stream started: ${streamSid} | call: ${callSid} | agent: ${agentIdForReconnect}`);
          if (agentIdForReconnect) {
            connectToElevenLabs(agentIdForReconnect).catch(err => {
              console.error(`❌ Initial ElevenLabs connection failed: ${err.message}`);
              scheduleReconnect("initial connection failed");
            });
          } else {
            console.error("❌ No agent_id in stream parameters");
          }
          break;

        case "media":
          // ALWAYS try to forward audio to ElevenLabs.
          // If we can't, buffer it for when ElevenLabs reconnects.
          if (elevenLabsReady && elevenLabsWs?.readyState === WebSocket.OPEN) {
            try {
              elevenLabsWs.send(JSON.stringify({ user_audio_chunk: msg.media.payload }));
              audioChunksSent++;
              if (audioSendStartTime === 0) audioSendStartTime = Date.now();

              // Log audio flow periodically (every 250 chunks ≈ 5 seconds)
              if (audioChunksSent % 250 === 0) {
                console.log(`📊 Audio flow: ${audioChunksSent} chunks sent to EL, ${audioChunksReceived} received from EL, last transcript: ${lastTranscriptTime ? Math.round((Date.now() - lastTranscriptTime)/1000) + 's ago' : 'never'}`);
              }
            } catch (err) {
              // Send failed — DON'T set elevenLabsReady=false permanently!
              // Just log the error and buffer this chunk. The heartbeat/close
              // handler will detect the dead connection and trigger reconnect.
              console.error(`❌ Audio send failed: ${err.message} — buffering`);
              if (!audioBufferStartTime) audioBufferStartTime = Date.now();
              audioBuffer.push(msg.media.payload);
            }
          } else {
            // ElevenLabs not ready — buffer the audio
            if (!audioBufferStartTime) audioBufferStartTime = Date.now();
            audioBuffer.push(msg.media.payload);
            // Cap at ~5 seconds (250 chunks at 20ms each)
            if (audioBuffer.length > 250) audioBuffer.shift();
          }
          break;

        case "dtmf":
          if (msg.dtmf?.digit) {
            const digit = msg.dtmf.digit;
            console.log(`📱 DTMF: user pressed '${digit}' — ready=${elevenLabsReady}, wsOpen=${elevenLabsWs?.readyState === WebSocket.OPEN}`);
            // Clear audio buffer — DTMF tones leak into media stream as audio
            audioBuffer = [];
            audioBufferStartTime = null;
          }
          break;

        case "stop":
          console.log("🛑 Twilio stream stopped");
          callEnded = true;
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
          stopSilenceKeepAlive();
          stopHeartbeatMonitor();
          if (elevenLabsWs) {
            elevenLabsWs.removeAllListeners();
            try { elevenLabsWs.close(); } catch (_) {}
            elevenLabsWs = null;
          }
          break;
      }
    } catch (e) {
      console.error("Error handling Twilio message:", e.message);
    }
  });

  ws.on("close", (code) => {
    console.log(`🛑 Twilio WS closed (${code}) — sent ${audioChunksSent} chunks, received ${audioChunksReceived} chunks`);
    callEnded = true;
    agentIdForReconnect = null;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    stopSilenceKeepAlive();
    stopHeartbeatMonitor();
    if (elevenLabsWs) {
      elevenLabsWs.removeAllListeners();
      try { elevenLabsWs.close(); } catch (_) {}
      elevenLabsWs = null;
    }
  });
});

/* ────────────────────────────────────────────
 * POST /call/elevenlabs-webhook — ElevenLabs Post-Call Webhook
 * ──────────────────────────────────────────── */
router.post("/elevenlabs-webhook", async (req, res) => {
  try {
    const callData = req.body;
    console.log("🔔 ElevenLabs Webhook Received for Agent ID:", callData.agent_id);
    
    if (callData.call_id) {
       console.log(`✅ Transcript for call ${callData.call_id}:`, callData.transcript);
    }

    res.status(200).send("Webhook received successfully");
  } catch (error) {
    console.error("ElevenLabs Webhook Error:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
