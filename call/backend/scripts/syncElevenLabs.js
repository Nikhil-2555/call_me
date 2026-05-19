/**
 * scripts/syncElevenLabs.js
 * One-time utility: push correct audio formats & DTMF instructions to all
 * ElevenLabs agents stored in MongoDB.
 *
 * Run: node scripts/syncElevenLabs.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Agent = require("../models/Agent");
const { updateAgent } = require("../config/elevenlabs");
const { appendDtmfInstructions } = require("../utils/dtmf");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB\n");

  const agents = await Agent.find({ elevenlabs_agent_id: { $nin: [null, ""] } });
  console.log(`Found ${agents.length} agents to sync.\n`);

  for (const agent of agents) {
    console.log(`Syncing: ${agent.name} (${agent.elevenlabs_agent_id})`);

    const prompt = appendDtmfInstructions(
      agent.system_prompt ||
      agent.conversation_config?.conversation?.system_prompt ||
      "You are a helpful AI assistant."
    );

    try {
      await updateAgent(agent.elevenlabs_agent_id, {
        conversation_config: {
          agent: {
            prompt: {
              prompt,
              llm: agent.llm_model || "gemini-2.0-flash",
              temperature: agent.temperature ?? 0.7,
            },
            first_message: agent.first_message || "Hello! How can I help you today?",
            language: agent.language || "en",
          },
          asr: { user_input_audio_format: "ulaw_8000" },
          tts: { agent_output_audio_format: "ulaw_8000" },
        },
      });
      console.log(`  ✅ Synced`);
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
    }
  }

  console.log("\nSync complete.");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
