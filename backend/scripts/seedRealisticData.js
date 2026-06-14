/**
 * scripts/seedRealisticData.js
 * Generates realistic-looking fake call history data for the last 90 days
 * to populate the dashboard graph and history table.
 */
const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const Conversation = require("../models/Conversation");
const { v4: uuidv4 } = require("uuid");

const agents = ["Support Bot", "Sales Bot", "Billing Assistant"];
const tagsList = [
  ["support", "reset-password"],
  ["sales", "pricing", "inquiry"],
  ["billing", "invoice", "refund"],
  ["support", "bug-report"],
  ["sales", "demo-request"],
  ["general", "inquiry"],
];
const names = ["Alice Smith", "Bob Johnson", "Charlie Brown", "Diana Prince", "Evan Wright", "Fiona Gallagher", "George Lucas", "Hannah Abbott", "Ian Somerhalder", "Jenny Jenkins"];

// Helper to get random item from array
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper to get a random number between min and max
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate fake turns
function generateTurns(msgCount) {
  const turns = [];
  let timeSec = 0;
  for (let i = 0; i < msgCount; i++) {
    const isUser = i % 2 !== 0;
    timeSec += randomInt(5, 15);
    const m = Math.floor(timeSec / 60);
    const s = String(timeSec % 60).padStart(2, "0");
    
    turns.push({
      speaker: isUser ? "user" : "agent",
      text: isUser ? "Can you help me with my account?" : "Sure, I can help you with that. What is your email?",
      time: `${m}:${s}`
    });
  }
  return { turns, totalTime: timeSec };
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  // Clear existing conversations
  await Conversation.deleteMany({});
  console.log("Cleared old conversations.");

  const conversations = [];
  const today = new Date();

  // Generate ~300 calls over the last 90 days
  const totalCalls = 300;
  
  for (let i = 0; i < totalCalls; i++) {
    // Random day in the last 90 days
    const daysAgo = randomInt(0, 89);
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(randomInt(8, 20), randomInt(0, 59), randomInt(0, 59));

    // Randomize status (80% success, 20% failed/dropped)
    const isSuccess = Math.random() < 0.8;
    const evaluation = isSuccess ? "Successful" : "Failed";

    const msgCount = isSuccess ? randomInt(5, 40) : randomInt(1, 4);
    const { turns, totalTime } = generateTurns(msgCount);
    
    const minutes = Math.floor(totalTime / 60);
    const seconds = String(totalTime % 60).padStart(2, "0");
    const duration = `${minutes}:${seconds}`;

    const creditsCall = totalTime * 10;
    const creditsLLM = msgCount * 2;
    const costPerMin = 0.0003;
    const totalUSD = (totalTime / 60) * costPerMin;

    conversations.push({
      id: `CA${uuidv4().replace(/-/g, "")}`,
      date,
      agent: randomItem(agents),
      duration,
      messages: msgCount,
      evaluation,
      creditsCall,
      creditsLLM,
      costPerMin,
      totalUSD: Number(totalUSD.toFixed(4)),
      transcript: isSuccess 
        ? "The customer inquired about their account status and the agent successfully provided the necessary details." 
        : "Call disconnected prematurely before the issue could be resolved.",
      client: {
        name: randomItem(names),
        phone: `+1-555-${randomInt(1000, 9999)}`
      },
      recordingUrl: `/recordings/sample.mp3`,
      tags: randomItem(tagsList),
      turns
    });
  }

  await Conversation.insertMany(conversations);
  console.log(`Successfully seeded ${conversations.length} realistic conversations.`);
  
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
