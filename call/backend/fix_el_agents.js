/**
 * fix_el_agents.js
 * Permanently sets audio formats on both ElevenLabs agents so no runtime override is needed.
 */
require("dotenv").config();
const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

const agents = [
  "agent_8901krxv46tqee1s0qtvmqvr3t9g",  // Technical Support
  "agent_4901kre5g984e7jt593x9qhq127b",  // Admission Agent
];

async function run() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  for (const agentId of agents) {
    console.log(`\nUpdating ${agentId}...`);

    // Fetch current config first
    const fetchRes = await fetch(`${ELEVENLABS_API}/convai/agents/${agentId}`, {
      headers: { "xi-api-key": apiKey },
    });
    const current = await fetchRes.json();
    console.log("  Name:", current.name);
    console.log("  Current ASR format:", current.conversation_config.asr.user_input_audio_format);
    console.log("  Current TTS format:", current.conversation_config.tts.agent_output_audio_format);

    // Patch ONLY the audio formats
    const patchRes = await fetch(`${ELEVENLABS_API}/convai/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversation_config: {
          asr: {
            user_input_audio_format: "ulaw_8000",   // Twilio sends mulaw 8kHz
          },
          tts: {
            agent_output_audio_format: "ulaw_8000", // Twilio expects mulaw 8kHz
          },
        },
      }),
    });

    if (patchRes.ok) {
      console.log("  ✅ Updated successfully");
    } else {
      const err = await patchRes.text();
      console.log("  ❌ Failed:", err);
    }
  }

  // Verify
  console.log("\n--- Verifying ---");
  for (const agentId of agents) {
    const r = await fetch(`${ELEVENLABS_API}/convai/agents/${agentId}`, {
      headers: { "xi-api-key": apiKey },
    });
    const d = await r.json();
    console.log(`${d.name}:`);
    console.log(`  ASR: ${d.conversation_config.asr.user_input_audio_format}`);
    console.log(`  TTS: ${d.conversation_config.tts.agent_output_audio_format}`);
  }

  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
