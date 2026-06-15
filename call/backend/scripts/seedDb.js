/**
 * scripts/seedDb.js     (was: seed.js)
 * Populate the database with sample data for development.
 * Run: node scripts/seedDb.js
 */
const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const Agent = require("../models/Agent");
const PhoneNumber = require("../models/PhoneNumber");
const User = require("../models/User");

const { v4: uuidv4 } = require("uuid");

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  // Clear existing data
  await Promise.all([Agent.deleteMany(), PhoneNumber.deleteMany()]);

  // Sample agents
  const agents = await Agent.insertMany([
    {
      agent_id: uuidv4(),
      name: "Sales Bot",
      system_prompt: "You are a helpful sales assistant.",
      first_message: "Hi! How can I help you today?",
      language: "en",
      tags: ["sales"],
    },
    {
      agent_id: uuidv4(),
      name: "Support Bot",
      system_prompt: "You are a technical support agent.",
      first_message: "Hello! What issue can I help you resolve?",
      language: "en",
      tags: ["support"],
    },
  ]);

  console.log(`Seeded ${agents.length} agents.`);
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
