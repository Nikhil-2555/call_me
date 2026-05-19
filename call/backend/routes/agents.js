const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Agent = require("../models/Agent");

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

/* DTMF rules appended to every system prompt — prevents agent ending call on keypress */
const DTMF_INSTRUCTIONS = `

IMPORTANT — KEYPAD INPUT RULES (do NOT ignore):
- During this phone call the user may press keys on their dial pad.
- You will receive these as messages starting with "User pressed keypad: " followed by the digit.
- Treat this as a keypad press, NOT as a command to end the call or an error.
- NEVER hang up, end the conversation, or say goodbye solely because the user pressed a key.
- Acknowledge the key naturally (e.g. "Got it, you pressed 0. Let me help you with that.") and continue the conversation.`;

/* ────────────────────────────────────────────
 * Helper: Create agent on ElevenLabs
 * ──────────────────────────────────────────── */
async function createElevenLabsAgent(agentData) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null; // skip if no key

  try {
    const res = await fetch(`${ELEVENLABS_API}/convai/agents/create`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: agentData.name,
        conversation_config: {
          agent: {
            prompt: {
              prompt: (agentData.system_prompt || "You are a helpful AI assistant.") + DTMF_INSTRUCTIONS,
              llm: agentData.llm_model || "gemini-2.0-flash",
              temperature: agentData.temperature ?? 0.7,
              max_tokens: agentData.max_tokens > 0 ? agentData.max_tokens : undefined,
            },
            first_message: agentData.first_message || "Hello! How can I help you today?",
            language: agentData.language || "en",
          },
          tts: {
            voice_id: agentData.voice_id || undefined,
            model_id: (agentData.language || "en").toLowerCase().startsWith("en") ? "eleven_turbo_v2" : "eleven_turbo_v2_5",
            agent_output_audio_format: "ulaw_8000", // pre-configure for Twilio telephony
          },
          asr: {
            quality: agentData.asr_quality || "high",
            provider: agentData.asr_provider || "elevenlabs",
          },
          turn: {
            turn_timeout: agentData.turn_timeout ?? 7,
          },
          conversation: {
            max_duration_seconds: agentData.max_duration_seconds ?? 600,
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("ElevenLabs agent creation failed:", res.status, errText);
      return null;
    }

    const data = await res.json();
    console.log(`✅ ElevenLabs agent created: ${data.agent_id}`);
    return data.agent_id; // ElevenLabs agent ID
  } catch (err) {
    console.error("ElevenLabs agent creation error:", err.message);
    return null;
  }
}

/* ────────────────────────────────────────────
 * GET /agents/ — list agents
 * ──────────────────────────────────────────── */
router.get("/", async (req, res) => {
  try {
    const pageSize = parseInt(req.query.page_size) || 30;
    const agents = await Agent.find().sort({ created_at_unix_secs: -1 }).limit(pageSize).lean();
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* ────────────────────────────────────────────
 * POST /agents/ — create agent (DB + ElevenLabs)
 * ──────────────────────────────────────────── */
router.post("/", async (req, res) => {
  try {
    const body = req.body;
    const agent_id = uuidv4();

    const agentData = {
      agent_id,
      name: body.name || "Untitled Agent",
      tags: body.tags || [],
      system_prompt: body.system_prompt || "",
      voice_id: body.voice_id || "",
      language: body.language || "en",
      first_message: body.first_message || "",
      llm_model: body.llm_model || "gemini-2.0-flash",
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? -1,
      tts_model: body.tts_model || "eleven_turbo_v2_5",
      stability: body.stability ?? 0.5,
      similarity_boost: body.similarity_boost ?? 0.8,
      style: body.style ?? 0,
      use_speaker_boost: body.use_speaker_boost ?? true,
      asr_quality: body.asr_quality || "high",
      asr_provider: body.asr_provider || "elevenlabs",
      turn_timeout: body.turn_timeout ?? 7,
      max_duration_seconds: body.max_duration_seconds ?? 600,
      text_only: body.text_only ?? false,
      knowledge_base: body.knowledge_base || [],
      twilio_phone_number_id: body.twilio_phone_number_id || "",
      conversation_config: body.conversation_config || {
        asr: {}, turn: {}, tts: {},
        conversation: {
          system_prompt: body.system_prompt || "",
          first_message: body.first_message || "",
          language: body.language || "en",
          voice_id: body.voice_id || "",
        },
        language_presets: {},
        agent: {},
      },
      platform_settings: body.platform_settings || {},
      workflow: body.workflow || {},
    };

    // Also create the agent on ElevenLabs for voice calling
    const elevenLabsAgentId = await createElevenLabsAgent(agentData);
    if (elevenLabsAgentId) {
      agentData.elevenlabs_agent_id = elevenLabsAgentId;
    }

    const agent = await Agent.create(agentData);
    console.log(`✅ Agent created: ${agent.name} (${agent.agent_id})`);
    res.status(201).json(agent.agent_id);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* ────────────────────────────────────────────
 * GET /agents/:id — get single agent
 * ──────────────────────────────────────────── */
router.get("/:id", async (req, res) => {
  try {
    const agent = await Agent.findOne({ agent_id: req.params.id }).lean();
    if (!agent) return res.status(404).json({ detail: "Agent not found" });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* ────────────────────────────────────────────
 * PUT /agents/:id — update agent
 * ──────────────────────────────────────────── */
router.put("/:id", async (req, res) => {
  try {
    const agent = await Agent.findOneAndUpdate(
      { agent_id: req.params.id },
      { $set: req.body },
      { new: true, lean: true }
    );
    if (!agent) return res.status(404).json({ detail: "Agent not found" });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* ────────────────────────────────────────────
 * DELETE /agents/:id — delete agent
 * ──────────────────────────────────────────── */
router.delete("/:id", async (req, res) => {
  try {
    const result = await Agent.findOneAndDelete({ agent_id: req.params.id });
    if (!result) return res.status(404).json({ detail: "Agent not found" });
    res.json({ message: "Agent deleted", agent_id: req.params.id });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;
