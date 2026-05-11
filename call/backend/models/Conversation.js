const mongoose = require("mongoose");

const turnSchema = new mongoose.Schema({
  speaker: { type: String },
  text:    { type: String },
  time:    { type: String },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  date:        { type: Date, default: Date.now },
  agent:       { type: String, default: "agent" },
  duration:    { type: String, default: "0:00" },
  messages:    { type: Number, default: 0 },
  evaluation:  { type: String, enum: ["Successful", "In Progress", "Failed"], default: "Successful" },
  creditsCall: { type: Number, default: 0 },
  creditsLLM:  { type: Number, default: 0 },
  costPerMin:  { type: Number, default: 0.0003 },
  totalUSD:    { type: Number, default: 0 },
  transcript:  { type: String, default: "" },
  client: {
    phone: { type: String, default: "" },
    name:  { type: String, default: "" },
  },
  recordingUrl: { type: String, default: "" },
  tags:         { type: [String], default: [] },
  turns:        [turnSchema],
  clientOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
});

module.exports = mongoose.model("Conversation", conversationSchema);
