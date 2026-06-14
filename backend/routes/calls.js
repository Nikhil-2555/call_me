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

/* ────────────────────────────────────────────
 * Helper: Ensure agent has a valid ElevenLabs ID
 * Creates one on ElevenLabs if missing, then saves it to DB.
 * ──────────────────────────────────────────── */
async function ensureElevenLabsAgent(agent) {
  // If we already have an ID, verify it is still valid
  if (agent.elevenlabs_agent_id) {
    try {
      await getSignedUrl(agent.elevenlabs_agent_id);
      return agent.elevenlabs_agent_id;
    } catch {
      console.warn(`⚠️  ElevenLabs agent "${agent.elevenlabs_agent_id}" invalid — creating new one`);
    }
  }

  // Build the prompt with DTMF instructions baked in
  const prompt = appendDtmfInstructions(
    agent.system_prompt ||
    agent.conversation_config?.conversation?.system_prompt ||
    "You are a helpful AI assistant."
  );

  // Use the best voice for natural human conversation
  // "Chris" (iP95p4xoKVk53GoZ742B) is a charming, down-to-earth conversational voice
  const voiceId = agent.voice_id || "iP95p4xoKVk53GoZ742B";

  const newId = await createElAgent({
    name: agent.name || "Callify Agent",
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
        user_input_audio_format: "ulaw_8000",   // Twilio sends mulaw 8 kHz
      },
      tts: {
        model_id: "eleven_multilingual_v2",      // Best quality, most human-like
        voice_id: voiceId,
        agent_output_audio_format: "ulaw_8000",  // Twilio expects mulaw 8 kHz
        stability: agent.stability ?? 0.4,        // Lower = more expressive & human
        similarity_boost: agent.similarity_boost ?? 0.85,
        style: agent.style ?? 0.3,                // Adds natural speaking style
        use_speaker_boost: true,                  // Clearer, richer voice
        optimize_streaming_latency: 3,            // Optimize for real-time calls
      },
      turn: {
        turn_timeout: agent.turn_timeout ?? 1.2,
        mode: "turn",                       // Natural turn-based conversation
      },
      conversation: { max_duration_seconds: agent.max_duration_seconds ?? 600 },
    },
  });

  // Persist the new ElevenLabs agent ID to MongoDB
  await Agent.findByIdAndUpdate(agent._id, { elevenlabs_agent_id: newId });
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
    // Use a long <Pause> loop as fallback so the call stays alive even if the stream
    // momentarily drops (e.g. ElevenLabs trial DTMF disconnect + reconnect).
    // The call ends only when we explicitly hang up or the user disconnects.
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
  let isReconnecting = false;
  let elevenLabsReady = false;
  let audioBuffer = [];           // Buffer audio while ElevenLabs connects
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  let silenceInterval = null;     // Sends silence frames to keep Twilio stream alive

  /* ── Flush buffered audio to ElevenLabs ── */
  function flushAudioBuffer() {
    if (!audioBuffer.length) return;
    console.log(`📤 Flushing ${audioBuffer.length} buffered audio chunks`);
    for (const chunk of audioBuffer) {
      if (elevenLabsWs?.readyState === WebSocket.OPEN) {
        elevenLabsWs.send(JSON.stringify({ user_audio_chunk: chunk }));
      }
    }
    audioBuffer = [];
  }

  /**
   * Send silence (mulaw 8kHz zero-energy frames) to Twilio so the stream
   * doesn't time out while ElevenLabs is reconnecting.
   */
  function startSilenceKeepAlive() {
    stopSilenceKeepAlive();
    // 160 bytes of mulaw silence (0xFF) = 20ms at 8kHz. Send every 200ms.
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

  /* ── Connect (or reconnect) to ElevenLabs ── */
  async function connectToElevenLabs(agentId) {
    try {
      const agent = await Agent.findOne({ agent_id: agentId }).lean();
      if (!agent) { console.error(`❌ Agent not found: ${agentId}`); return; }

      let elevenLabsAgentId;
      try {
        elevenLabsAgentId = await ensureElevenLabsAgent(agent);
      } catch (err) {
        console.error(`❌ Cannot prepare ElevenLabs agent: ${err.message}`); return;
      }

      const signedUrl = await getSignedUrl(elevenLabsAgentId);
      console.log(`⚡ Connecting to ElevenLabs agent: ${elevenLabsAgentId}`);
      console.log(`🔑 Signed URL obtained: ${signedUrl?.slice(0, 80)}…`);

      // Clean up old WebSocket to prevent stale event listeners from firing
      if (elevenLabsWs) {
        elevenLabsWs.removeAllListeners();
        if (elevenLabsWs.readyState === WebSocket.OPEN || elevenLabsWs.readyState === WebSocket.CONNECTING) {
          try { elevenLabsWs.close(); } catch (_) {}
        }
        elevenLabsWs = null;
      }
      elevenLabsReady = false;

      // Clear stale audio buffer before reconnecting — it likely contains
      // DTMF tone audio that would immediately kill the new session.
      audioBuffer = [];

      elevenLabsWs = new WebSocket(signedUrl);

      elevenLabsWs.on("open", () => {
        console.log("✅ ElevenLabs connected");
        reconnectAttempts = 0; // Reset on successful connect
        // No config overrides — audio format is permanently set on the agent
        elevenLabsWs.send(JSON.stringify({ type: "conversation_initiation_client_data" }));
        // DON'T flush audio here — ElevenLabs isn't ready until conversation_initiation_metadata.
        // Flushing here sends audio that gets dropped, so user's voice is lost.
      });

      elevenLabsWs.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          switch (msg.type) {
            case "audio": {
              const chunk = msg.audio?.chunk || msg.audio_event?.audio_base_64;
              if (chunk && streamSid && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: chunk } }));
              }
              break;
            }
            case "interruption":
              // Clear Twilio buffer so agent stops speaking immediately when user interrupts
              if (streamSid && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ event: "clear", streamSid }));
              }
              break;
            case "ping":
              if (msg.ping_event?.event_id) {
                elevenLabsWs.send(JSON.stringify({ type: "pong", event_id: msg.ping_event.event_id }));
              }
              break;
            case "conversation_initiation_metadata":
              console.log("🟢 ElevenLabs agent live and ready");
              elevenLabsReady = true;
              stopSilenceKeepAlive(); // Stop sending silence, real audio is flowing now
              flushAudioBuffer();
              break;
            case "agent_response":
              console.log(`🤖 Agent: ${msg.agent_response_event?.agent_response || "(audio)"}`);
              if (callSid) Conversation.updateOne({ id: callSid }, { $inc: { messages: 1 } }).catch(e => {});
              break;
            case "user_transcript":
              console.log(`👤 User: ${msg.user_transcription_event?.user_transcript || "(inaudible)"}`);
              if (callSid) Conversation.updateOne({ id: callSid }, { $inc: { messages: 1 } }).catch(e => {});
              break;
            case "conversation_ended":
              console.log("🔔 ElevenLabs conversation ended:", JSON.stringify(msg).slice(0, 200));
              elevenLabsReady = false;
              // DON'T close Twilio stream here — let Twilio control the call lifecycle.
              // On trial accounts, ElevenLabs may end prematurely due to DTMF tones in audio.
              // Start sending silence to keep the Twilio stream alive while we reconnect.
              startSilenceKeepAlive();
              // Actively close the ElevenLabs WS to trigger the reconnect in the "close" handler.
              // Without this, ElevenLabs may keep the WebSocket open after conversation_ended,
              // and the reconnect never fires — leaving the agent silent.
              if (elevenLabsWs) {
                try { elevenLabsWs.close(); } catch (_) {}
              }
              break;
            case "internal_tentative_agent_response":
              break; // ignore
            default:
              console.log(`🔔 ElevenLabs event [${msg.type}]:`, JSON.stringify(msg).slice(0, 150));
          }
        } catch (e) {
          console.error("Error parsing ElevenLabs message:", e.message);
        }
      });

      elevenLabsWs.on("close", (code, reason) => {
        console.log(`❌ ElevenLabs closed (${code}): ${reason}`);
        elevenLabsReady = false;
        // Auto-reconnect to keep the Twilio call alive
        if (ws.readyState === WebSocket.OPEN && agentIdForReconnect && !isReconnecting) {
          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log(`⛔ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up`);
            stopSilenceKeepAlive();
            return;
          }
          isReconnecting = true;
          reconnectAttempts++;
          // Exponential backoff: 1s, 2s, 4s, …
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 8000);
          console.log(`🔄 Reconnecting to ElevenLabs in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…`);
          startSilenceKeepAlive(); // Keep Twilio stream alive during reconnect
          setTimeout(async () => {
            try { await connectToElevenLabs(agentIdForReconnect); }
            catch (err) { console.error("Reconnect failed:", err.message); }
            finally { isReconnecting = false; }
          }, delay);
        }
      });

      elevenLabsWs.on("error", (err) => {
        console.error("ElevenLabs WS error:", err.message);
        elevenLabsReady = false;
      });
    } catch (err) {
      console.error("connectToElevenLabs fatal:", err.message);
    }
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
          console.log(`   PUBLIC_URL at stream time: ${process.env.PUBLIC_URL}`);
          if (agentIdForReconnect) {
            connectToElevenLabs(agentIdForReconnect);
          } else {
            console.error("❌ No agent_id in stream parameters");
          }
          break;

        case "media":
          if (elevenLabsWs?.readyState === WebSocket.OPEN && elevenLabsReady) {
            elevenLabsWs.send(JSON.stringify({ user_audio_chunk: msg.media.payload }));
          } else if (!elevenLabsReady) {
            audioBuffer.push(msg.media.payload);
            if (audioBuffer.length > 500) audioBuffer.shift(); // cap at ~10s to cover reconnect window
          }
          break;

        case "dtmf":
          if (msg.dtmf?.digit) {
            const digit = msg.dtmf.digit;
            console.log(`📱 DTMF: user pressed '${digit}' (ignored — buffer cleared)`);
            // We do not forward DTMF to ElevenLabs because it can cause protocol errors
            // and terminate the agent session abruptly (which drops the call).
            // Also clear the audio buffer — DTMF tones leak into the media stream as audio
            // and would poison any reconnected ElevenLabs session.
            audioBuffer = [];
          }
          break;

        case "stop":
          console.log("🛑 Twilio stream stopped");
          stopSilenceKeepAlive();
          elevenLabsWs?.close();
          break;
      }
    } catch (e) {
      console.error("Error handling Twilio message:", e.message);
    }
  });

  ws.on("close", (code) => {
    console.log(`🛑 Twilio WS closed (${code})`);
    agentIdForReconnect = null; // stop reconnect loop
    stopSilenceKeepAlive();
    elevenLabsWs?.close();
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
       
       // Example of updating DB if we match ElevenLabs call_id 
       // If you mapped call_id in DB, you would do:
       // await Conversation.updateOne({ elevenlabs_call_id: callData.call_id }, { ... })
    }

    res.status(200).send("Webhook received successfully");
  } catch (error) {
    console.error("ElevenLabs Webhook Error:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
