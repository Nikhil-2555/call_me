const mongoose = require("mongoose");

const mcpServerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },

  config: {
    url:              { type: String, required: true },
    name:             { type: String, required: true },
    approval_policy:  { type: String, default: "require_approval_all" },
    transport:        { type: String, default: "SSE" },
    description:      { type: String, default: "" },
    request_headers:  { type: mongoose.Schema.Types.Mixed, default: {} },
    secret_token:     { type: mongoose.Schema.Types.Mixed, default: null },
    tool_approval_hashes: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },

  metadata: {
    created_at:     { type: Number, default: () => Math.floor(Date.now() / 1000) },
    owner_user_id:  { type: String, default: "user_default" },
  },

  access_info: {
    is_creator:    { type: Boolean, default: true },
    creator_email: { type: String, default: "callify@gmail.com" },
    role:          { type: String, default: "owner" },
  },

  dependent_agents: { type: [String], default: [] },

  /* Virtual field used in summary list */
  tools: { type: [{ name: String, description: String }], default: [] },
});

module.exports = mongoose.model("McpServer", mcpServerSchema);
