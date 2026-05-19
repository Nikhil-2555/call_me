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

  const newId = await createElAgent({
    name: agent.name || "Callify Agent",
    conversation_config: {
      agent: {
        prompt: {
          prompt,
          llm: agent.llm_model || "gemini-2.0-flash",
          temperature: agent.temperature ?? 0.7,
          max_tokens: agent.max_tokens > 0 ? agent.max_tokens : undefined,
        },
        first_message: agent.first_message || "Hello! How can I help you today?",
        language: agent.language || "en",
      },
      asr: {
        quality: agent.asr_quality || "high",
        provider: agent.asr_provider || "elevenlabs",
        user_input_audio_format: "ulaw_8000",   // Twilio sends mulaw 8 kHz
      },
      tts: {
        model_id: (agent.language || "en").toLowerCase().startsWith("en")
          ? "eleven_turbo_v2"
          : "eleven_turbo_v2_5",
        voice_id: agent.voice_id || undefined,
        agent_output_audio_format: "ulaw_8000", // Twilio expects mulaw 8 kHz
      },
      turn: { turn_timeout: agent.turn_timeout ?? 7 },
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
    const host = (process.env.PUBLIC_URL || `http://${req.headers.host}`).replace(/^https?:\/\//, "");
    const statusCallback = `https://${host}/call/status`;
    const twiml = `<Response><Connect><Stream url="wss://${host}/call/stream"><Parameter name="agent_id" value="${agent_id}" /></Stream></Connect></Response>`;

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
  const host = (process.env.PUBLIC_URL || `http://${req.headers.host}`).replace(/^https?:\/\//, "");

  let agentId = "";
  try {
    const calledNumber = req.body.Called || req.body.To || "";
    const phone = await PhoneNumber.findOne({ phone_number: calledNumber }).lean();
    if (phone?.assigned_agent?.agent_id) {
      agentId = phone.assigned_agent.agent_id;
      // Pre-warm ElevenLabs agent so the first call connects faster
      const agent = await Agent.findOne({ agent_id: agentId }).lean();
      if (agent) {
        await ensureElevenLabsAgent(agent).catch(console.error);
        
        // Create Conversation record for incoming call
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

  res.type("text/xml").send(
    `<Response><Connect><Stream url="wss://${host}/call/stream"><Parameter name="agent_id" value="${agentId}" /></Stream></Connect></Response>`
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
      elevenLabsWs = new WebSocket(signedUrl);

      elevenLabsWs.on("open", () => {
        console.log("✅ ElevenLabs connected");
        // No config overrides — audio format is permanently set on the agent
        elevenLabsWs.send(JSON.stringify({ type: "conversation_initiation_client_data" }));
        flushAudioBuffer();
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
              // Optionally clear Twilio buffer: ws.send(JSON.stringify({ event: "clear", streamSid }));
              break;
            case "ping":
              if (msg.ping_event?.event_id) {
                elevenLabsWs.send(JSON.stringify({ type: "pong", event_id: msg.ping_event.event_id }));
              }
              break;
            case "conversation_initiation_metadata":
              console.log("🟢 ElevenLabs agent live and ready");
              elevenLabsReady = true;
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
          isReconnecting = true;
          console.log("🔄 Reconnecting to ElevenLabs in 1s…");
          setTimeout(async () => {
            try { await connectToElevenLabs(agentIdForReconnect); }
            catch (err) { console.error("Reconnect failed:", err.message); }
            finally { isReconnecting = false; }
          }, 1000);
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
            if (audioBuffer.length > 100) audioBuffer.shift(); // cap at ~2 s
          }
          break;

        case "dtmf":
          if (msg.dtmf?.digit) {
            const digit = msg.dtmf.digit;
            console.log(`📱 DTMF: user pressed '${digit}'`);
            if (elevenLabsWs?.readyState === WebSocket.OPEN && elevenLabsReady) {
              elevenLabsWs.send(JSON.stringify({
                type: "user_message",
                text: `User pressed keypad: ${digit}`,
              }));
            }
          }
          break;

        case "stop":
          console.log("🛑 Twilio stream stopped");
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
    elevenLabsWs?.close();
  });
});

module.exports = router;
