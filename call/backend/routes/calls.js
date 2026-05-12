const router = require("express").Router();
const WebSocket = require("ws");
const PhoneNumber = require("../models/PhoneNumber");
const Agent = require("../models/Agent");
const twilio = require("twilio");

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

/* ────────────────────────────────────────────
 * Helper: Get a signed ElevenLabs WebSocket URL
 * ──────────────────────────────────────────── */
async function getSignedElevenLabsUrl(agentId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set in .env");

  const res = await fetch(
    `${ELEVENLABS_API}/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: { "xi-api-key": apiKey } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs signed URL error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.signed_url;
}

/* ────────────────────────────────────────────
 * Helper: Create an ElevenLabs agent on-the-fly
 * for agents that don't have one yet
 * ──────────────────────────────────────────── */
async function createElevenLabsAgentForCall(agent) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set in .env");

  const systemPrompt =
    agent.system_prompt ||
    agent.conversation_config?.conversation?.system_prompt ||
    "You are a helpful AI assistant.";

  const firstMessage =
    agent.first_message ||
    agent.conversation_config?.conversation?.first_message ||
    "Hello! How can I help you today?";

  const voiceId =
    agent.voice_id ||
    agent.conversation_config?.conversation?.voice_id ||
    undefined;

  const language = agent.language || agent.conversation_config?.conversation?.language || "en";

  console.log(`🔧 Creating ElevenLabs agent for "${agent.name}" on-the-fly...`);

  const body = {
    name: agent.name || "Callify Agent",
    conversation_config: {
      agent: {
        prompt: {
          prompt: systemPrompt,
          llm: agent.llm_model || "gemini-2.0-flash",
          temperature: agent.temperature ?? 0.7,
        },
        first_message: firstMessage,
        language: language,
      },
      tts: {
        model_id: language.toLowerCase().startsWith("en") ? "eleven_turbo_v2" : "eleven_turbo_v2_5",
      },
      asr: {
        quality: agent.asr_quality || "high",
        provider: agent.asr_provider || "elevenlabs",
      },
      turn: {
        turn_timeout: agent.turn_timeout ?? 7,
      },
      conversation: {
        max_duration_seconds: agent.max_duration_seconds ?? 600,
      },
    },
  };

  // Only include voice_id if it's set
  if (voiceId) {
    body.conversation_config.tts.voice_id = voiceId;
  }

  const res = await fetch(`${ELEVENLABS_API}/convai/agents/create`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs agent creation failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const elevenLabsAgentId = data.agent_id;
  console.log(`✅ ElevenLabs agent created on-the-fly: ${elevenLabsAgentId}`);

  // Save it back to DB so we don't have to create again next time
  await Agent.updateOne(
    { agent_id: agent.agent_id },
    { $set: { elevenlabs_agent_id: elevenLabsAgentId } }
  );
  console.log(`💾 Saved elevenlabs_agent_id to DB for "${agent.name}"`);

  return elevenLabsAgentId;
}

/* ────────────────────────────────────────────
 * Helper: Ensure an agent has an ElevenLabs agent ID
 * (create one if missing)
 * ──────────────────────────────────────────── */
async function ensureElevenLabsAgent(agent) {
  // If agent already has a valid ElevenLabs agent ID, verify it exists
  if (agent.elevenlabs_agent_id) {
    try {
      // Quick check: try to get a signed URL to verify the agent exists
      await getSignedElevenLabsUrl(agent.elevenlabs_agent_id);
      return agent.elevenlabs_agent_id;
    } catch (err) {
      console.warn(`⚠️ Existing ElevenLabs agent ID invalid for "${agent.name}", will create new one`);
    }
  }

  // Create a new ElevenLabs agent
  return await createElevenLabsAgentForCall(agent);
}

/* ────────────────────────────────────────────
 * POST /call/outbound — initiate an outbound call via Twilio
 * ──────────────────────────────────────────── */
router.post("/outbound", async (req, res) => {
  try {
    const { agent_id, agent_phone_number_id, to_number } = req.body;

    if (!agent_id || !agent_phone_number_id || !to_number) {
      return res.status(400).json({ detail: "agent_id, agent_phone_number_id, and to_number are required" });
    }

    const phone = await PhoneNumber.findOne({ phone_number_id: agent_phone_number_id });
    if (!phone) {
      return res.status(404).json({ detail: "Phone number not found" });
    }

    // Verify the agent exists and has an ElevenLabs agent before making the call
    const agent = await Agent.findOne({ agent_id }).lean();
    if (!agent) {
      return res.status(404).json({ detail: "Agent not found" });
    }

    // Ensure ElevenLabs agent exists (create if needed) BEFORE placing the call
    let elevenLabsAgentId;
    try {
      elevenLabsAgentId = await ensureElevenLabsAgent(agent);
    } catch (err) {
      console.error("Failed to ensure ElevenLabs agent:", err.message);
      return res.status(500).json({ detail: `Failed to prepare AI agent: ${err.message}` });
    }

    // Use Twilio API Key authentication
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_SECRET;

    if (!accountSid || !apiKeySid || !apiKeySecret) {
      return res.status(400).json({ detail: "TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, and TWILIO_API_SECRET must be set in .env" });
    }

    const client = twilio(apiKeySid, apiKeySecret, { accountSid });

    // Construct TwiML to connect the call to our WebSocket stream
    const host = process.env.PUBLIC_URL
      ? process.env.PUBLIC_URL.replace(/^https?:\/\//, "")
      : req.headers.host;

    const twiml = `<Response><Connect><Stream url="wss://${host}/call/stream"><Parameter name="agent_id" value="${agent_id}" /></Stream></Connect></Response>`;

    const call = await client.calls.create({
      twiml,
      to: to_number,
      from: phone.phone_number,
    });

    console.log(`📞 Outbound call queued: ${call.sid} → ${to_number} (ElevenLabs agent: ${elevenLabsAgentId})`);

    res.json({
      call_id: call.sid,
      status: call.status,
      agent_id,
      to_number,
      message: "Outbound call initiated successfully",
    });
  } catch (err) {
    console.error("Outbound Call Error:", err);
    res.status(500).json({ detail: err.message });
  }
});

/* ────────────────────────────────────────────
 * POST /call/incoming — Twilio Voice Webhook
 * ──────────────────────────────────────────── */
router.post("/incoming", async (req, res) => {
  const host = process.env.PUBLIC_URL
    ? process.env.PUBLIC_URL.replace(/^https?:\/\//, "")
    : req.headers.host;

  // Try to find which agent is assigned to the called Twilio number
  const calledNumber = req.body.Called || req.body.To || "";
  let agentId = "";

  try {
    const phone = await PhoneNumber.findOne({ phone_number: calledNumber }).lean();
    if (phone?.assigned_agent?.agent_id) {
      agentId = phone.assigned_agent.agent_id;

      // Pre-ensure ElevenLabs agent exists for incoming calls too
      const agent = await Agent.findOne({ agent_id: agentId }).lean();
      if (agent) {
        await ensureElevenLabsAgent(agent);
      }
    }
  } catch (e) {
    console.error("Error looking up incoming number:", e);
  }

  const twiml = `<Response><Connect><Stream url="wss://${host}/call/stream"><Parameter name="agent_id" value="${agentId}" /></Stream></Connect></Response>`;

  res.type("text/xml");
  res.send(twiml);
});

/* ────────────────────────────────────────────
 * WS /call/stream — Twilio ↔ ElevenLabs bridge
 * ──────────────────────────────────────────── */
router.ws("/stream", (ws, req) => {
  console.log("📞 Twilio connected to WebSocket stream");

  let elevenLabsWs = null;
  let streamSid = null;

  /* ------ Connect to ElevenLabs when we know the agent ------ */
  async function connectToElevenLabs(agentId) {
    try {
      // Look up the agent's ElevenLabs config from DB
      const agent = await Agent.findOne({ agent_id: agentId }).lean();

      if (!agent) {
        console.error(`❌ Agent not found in DB: ${agentId}`);
        return;
      }

      // Ensure the agent has a valid ElevenLabs agent ID
      let elevenLabsAgentId;
      try {
        elevenLabsAgentId = await ensureElevenLabsAgent(agent);
      } catch (err) {
        console.error(`❌ Cannot get ElevenLabs agent for "${agent.name}":`, err.message);
        return;
      }

      // Get signed WebSocket URL (authenticated)
      const signedUrl = await getSignedElevenLabsUrl(elevenLabsAgentId);
      console.log(`⚡ Connecting to ElevenLabs (agent: ${elevenLabsAgentId})`);

      elevenLabsWs = new WebSocket(signedUrl);

      elevenLabsWs.on("open", () => {
        console.log("✅ ElevenLabs Conversational AI connected");

        // Send initial config if agent has custom settings
        const initMsg = {
          type: "conversation_initiation_client_data",
          conversation_config_override: {
            agent: {
              prompt: {
                prompt: agent.system_prompt || agent.conversation_config?.conversation?.system_prompt || "",
              },
              first_message: agent.first_message || agent.conversation_config?.conversation?.first_message || "",
              language: agent.language || "en",
            },
            tts: {
              voice_id: agent.voice_id || agent.conversation_config?.conversation?.voice_id || undefined,
            },
          },
        };
        elevenLabsWs.send(JSON.stringify(initMsg));
      });

      elevenLabsWs.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());

          switch (msg.type) {
            case "audio":
              // ElevenLabs → Twilio: stream AI voice back to the caller
              if (msg.audio_event?.audio_base_64 && streamSid) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    event: "media",
                    streamSid,
                    media: { payload: msg.audio_event.audio_base_64 },
                  }));
                }
              }
              break;

            case "interruption":
              // Clear Twilio's audio buffer when user interrupts
              if (streamSid) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ event: "clear", streamSid }));
                }
              }
              break;

            case "ping":
              // Keep-alive ping from ElevenLabs
              if (msg.ping_event?.event_id) {
                elevenLabsWs.send(JSON.stringify({
                  type: "pong",
                  event_id: msg.ping_event.event_id,
                }));
              }
              break;

            case "agent_response":
              console.log(`🤖 Agent says: ${msg.agent_response_event?.agent_response || "(audio)"}`);
              break;

            case "user_transcript":
              console.log(`👤 User said: ${msg.user_transcription_event?.user_transcript || "(inaudible)"}`);
              break;

            default:
              console.log(`🔔 ElevenLabs event: ${msg.type}`);
          }
        } catch (e) {
          console.error("Error parsing ElevenLabs message:", e);
        }
      });

      elevenLabsWs.on("close", (code, reason) => {
        console.log(`❌ ElevenLabs disconnected (${code}): ${reason}`);
      });

      elevenLabsWs.on("error", (error) => {
        console.error("ElevenLabs WebSocket Error:", error.message);
      });
    } catch (err) {
      console.error("Failed to connect to ElevenLabs:", err.message);
    }
  }

  /* ------ Handle messages from Twilio ------ */
  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);

      switch (msg.event) {
        case "start":
          streamSid = msg.start.streamSid;
          console.log(`🟢 Twilio stream started: ${streamSid}`);

          // Get the agent_id from custom parameters
          const agentId = msg.start.customParameters?.agent_id;
          if (agentId) {
            connectToElevenLabs(agentId);
          } else {
            console.warn("⚠️ No agent_id in stream parameters");
          }
          break;

        case "media":
          // Twilio → ElevenLabs: stream caller's voice to AI
          if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
            elevenLabsWs.send(JSON.stringify({
              user_audio_chunk: msg.media.payload,
            }));
          }
          break;

        case "stop":
          console.log("🛑 Twilio stream stopped");
          if (elevenLabsWs) elevenLabsWs.close();
          break;
      }
    } catch (e) {
      console.error("Error handling Twilio message:", e);
    }
  });

  ws.on("close", () => {
    console.log("🛑 Twilio WebSocket closed");
    if (elevenLabsWs) elevenLabsWs.close();
  });
});

module.exports = router;
