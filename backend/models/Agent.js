const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema({
  agent_id: { type: String, required: true, unique: true },
  name:     { type: String, required: true },
  tags:     { type: [String], default: [] },

  conversation_config: {
    asr:       { type: mongoose.Schema.Types.Mixed, default: {} },
    turn:      { type: mongoose.Schema.Types.Mixed, default: {} },
    tts:       { type: mongoose.Schema.Types.Mixed, default: {} },
    conversation: {
      system_prompt:  { type: String, default: "" },
      first_message:  { type: String, default: "" },
      language:       { type: String, default: "en" },
      voice_id:       { type: String, default: "" },
    },
    language_presets: { type: mongoose.Schema.Types.Mixed, default: {} },
    agent:           { type: mongoose.Schema.Types.Mixed, default: {} },
  },

  platform_settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  workflow:          { type: mongoose.Schema.Types.Mixed, default: {} },

  /* Extra fields for create-agent page payload */
  system_prompt:    { type: String, default: "" },
  voice_id:         { type: String, default: "" },
  language:         { type: String, default: "en" },
  first_message:    { type: String, default: "" },
  llm_model:        { type: String, default: "llama-3.3-70b-versatile" },
  temperature:      { type: Number, default: 0.7 },
  max_tokens:       { type: Number, default: -1 },
  tts_model:        { type: String, default: "eleven_turbo_v2_5" },
  stability:        { type: Number, default: 0.4 },
  similarity_boost: { type: Number, default: 0.85 },
  style:            { type: Number, default: 0.3 },
  use_speaker_boost:{ type: Boolean, default: true },
  asr_quality:      { type: String, default: "high" },
  asr_provider:     { type: String, default: "elevenlabs" },
  turn_timeout:     { type: Number, default: 1.2 },
  max_duration_seconds: { type: Number, default: 600 },
  text_only:        { type: Boolean, default: false },
  knowledge_base:   { type: [mongoose.Schema.Types.Mixed], default: [] },
  twilio_phone_number_id: { type: String, default: "" },
  elevenlabs_agent_id:    { type: String, default: "" },

  created_at_unix_secs: { type: Number, default: () => Math.floor(Date.now() / 1000) },
  access_info: {
    creator_name:  { type: String, default: "callify" },
    creator_email: { type: String, default: "callify@gmail.com" },
    role:          { type: String, default: "owner" },
    is_creator:    { type: Boolean, default: true },
  },
});

module.exports = mongoose.model("Agent", agentSchema);
