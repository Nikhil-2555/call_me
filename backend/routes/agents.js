const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const Agent = require("../models/Agent");

/* GET /agents/ — list agents */
router.get("/", async (req, res) => {
  try {
    const pageSize = parseInt(req.query.page_size) || 30;
    const agents = await Agent.find().sort({ created_at_unix_secs: -1 }).limit(pageSize).lean();
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* POST /agents/ — create agent */
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

    const agent = await Agent.create(agentData);
    res.status(201).json(agent.agent_id);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* GET /agents/:id — get single agent */
router.get("/:id", async (req, res) => {
  try {
    const agent = await Agent.findOne({ agent_id: req.params.id }).lean();
    if (!agent) return res.status(404).json({ detail: "Agent not found" });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* PUT /agents/:id — update agent */
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

/* DELETE /agents/:id — delete agent */
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
