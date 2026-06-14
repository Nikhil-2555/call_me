const mongoose = require("mongoose");

const recipientSchema = new mongoose.Schema({
  id:             { type: String, required: true },
  phone_number:   { type: String, required: true },
  status:         { type: String, enum: ["pending", "in_progress", "completed", "failed", "cancelled"], default: "pending" },
  created_at_unix:  { type: Number, default: () => Math.floor(Date.now() / 1000) },
  updated_at_unix:  { type: Number, default: () => Math.floor(Date.now() / 1000) },
  conversation_id:  { type: String, default: "" },
  conversation_initiation_client_data: { type: mongoose.Schema.Types.Mixed, default: null },
});

const batchCallSchema = new mongoose.Schema({
  id:   { type: String, required: true, unique: true },
  name: { type: String, required: true },

  agent_id:              { type: String, required: true },
  agent_name:            { type: String, default: "" },
  agent_phone_number_id: { type: String, default: "" },

  status: {
    type: String,
    enum: ["pending", "in_progress", "completed", "failed", "cancelled"],
    default: "pending",
  },

  total_calls_scheduled:  { type: Number, default: 0 },
  total_calls_dispatched: { type: Number, default: 0 },

  scheduled_time_unix:    { type: Number, default: null },
  created_at_unix:        { type: Number, default: () => Math.floor(Date.now() / 1000) },
  last_updated_at_unix:   { type: Number, default: () => Math.floor(Date.now() / 1000) },

  recipients: [recipientSchema],
});

module.exports = mongoose.model("BatchCall", batchCallSchema);
