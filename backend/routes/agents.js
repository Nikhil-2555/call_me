/**
 * routes/agents.js
 * CRUD operations for AI voice agents.
 * When an agent is created, it is also registered on ElevenLabs
 * with the correct audio formats and DTMF instructions baked in.
 */

const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Agent = require("../models/Agent");
const { createAgent: createElAgent, updateAgent: updateElAgent } = require("../config/elevenlabs");
const { appendDtmfInstructions } = require("../utils/dtmf");

/* ── Helper: create on ElevenLabs ── */
async function createElevenLabsAgent(agentData) {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  try {
    const prompt = appendDtmfInstructions(agentData.system_prompt || "You are a helpful AI assistant.");
    const voiceId = agentData.voice_id || "iP95p4xoKVk53GoZ742B"; // Chris - natural conversational voice
    const id = await createElAgent({
      name: agentData.name,
      conversation_config: {
        agent: {
          prompt: {
            prompt,
            llm: agentData.llm_model || "llama-3.3-70b-versatile",
            temperature: agentData.temperature ?? 0.7,
            max_tokens: agentData.max_tokens > 0 ? agentData.max_tokens : undefined,
          },
          first_message: agentData.first_message || "Hello! How can I help you today?",
          language: agentData.language || "en",
        },
        asr: {
          quality: "high",
          provider: agentData.asr_provider || "elevenlabs",
          user_input_audio_format: "ulaw_8000",
        },
        tts: {
          voice_id: voiceId,
          model_id: "eleven_multilingual_v2",      // Best quality, most human-like
          agent_output_audio_format: "ulaw_8000",
          stability: agentData.stability ?? 0.4,
          similarity_boost: agentData.similarity_boost ?? 0.85,
          style: agentData.style ?? 0.3,
          use_speaker_boost: true,
          optimize_streaming_latency: 3,
        },
        turn: {
          turn_timeout: agentData.turn_timeout ?? 1.2,
          mode: "turn",
        },
        conversation: { max_duration_seconds: agentData.max_duration_seconds ?? 600 },
      },
    });
    console.log(`✅ ElevenLabs agent created: ${id}`);
    return id;
  } catch (err) {
    console.error("ElevenLabs agent creation failed:", err.message);
    return null;
  }
}

/* ────────────────────────────────────────────
 * GET /agents/ — list agents
 * ──────────────────────────────────────────── */
router.get("/", async (req, res) => {
  try {
    const pageSize = Math.min(parseInt(req.query.page_size) || 30, 100);
    const agents = await Agent.find().sort({ created_at_unix_secs: -1 }).limit(pageSize).lean();
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* ────────────────────────────────────────────
 * POST /agents/ — create agent
 * ──────────────────────────────────────────── */
router.post("/", async (req, res) => {
  try {
    const body = req.body;
    const agent_id = uuidv4();

    const agentData = {
      agent_id,
      name:                body.name || "Untitled Agent",
      tags:                body.tags || [],
      system_prompt:       body.system_prompt || "",
      voice_id:            body.voice_id || "",
      language:            body.language || "en",
      first_message:       body.first_message || "",
      llm_model:           body.llm_model || "llama-3.3-70b-versatile",
      temperature:         body.temperature ?? 0.7,
      max_tokens:          body.max_tokens ?? -1,
      tts_model:           body.tts_model || "eleven_turbo_v2_5",
      stability:           body.stability ?? 0.5,
      similarity_boost:    body.similarity_boost ?? 0.8,
      style:               body.style ?? 0,
      use_speaker_boost:   body.use_speaker_boost ?? true,
      asr_quality:         body.asr_quality || "high",
      asr_provider:        body.asr_provider || "elevenlabs",
      turn_timeout:        body.turn_timeout ?? 1.2,
      max_duration_seconds: body.max_duration_seconds ?? 600,
      text_only:           body.text_only ?? false,
      knowledge_base:      body.knowledge_base || [],
      twilio_phone_number_id: body.twilio_phone_number_id || "",
      conversation_config: body.conversation_config || {
        asr: {}, turn: {}, tts: {},
        conversation: {
          system_prompt: body.system_prompt || "",
          first_message: body.first_message || "",
          language:      body.language || "en",
          voice_id:      body.voice_id || "",
        },
        language_presets: {},
        agent: {},
      },
      platform_settings: body.platform_settings || {},
      workflow:          body.workflow || {},
    };

    const elevenLabsAgentId = await createElevenLabsAgent(agentData);
    if (elevenLabsAgentId) agentData.elevenlabs_agent_id = elevenLabsAgentId;

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
