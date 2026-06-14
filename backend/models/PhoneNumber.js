const mongoose = require("mongoose");

const phoneNumberSchema = new mongoose.Schema({
  phone_number_id:    { type: String, required: true, unique: true },
  phone_number:       { type: String, required: true },
  label:              { type: String, default: "" },
  supports_inbound:   { type: Boolean, default: true },
  supports_outbound:  { type: Boolean, default: true },
  assigned_agent: {
    agent_id:   { type: String, default: null },
    agent_name: { type: String, default: null },
  },
  provider:  { type: String, default: "twilio" },
  sid:       { type: String, default: "" },
  token:     { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PhoneNumber", phoneNumberSchema);
