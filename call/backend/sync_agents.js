require("dotenv").config();
const mongoose = require("mongoose");
const Agent = require("./models/Agent");

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

const DTMF_INSTRUCTIONS = `\n\nIMPORTANT — KEYPAD INPUT RULES (do NOT ignore):
- During this phone call the user may press keys on their dial pad.
- You will receive these as messages starting with "User pressed keypad: " followed by the digit.
- Treat this as a keypad press, NOT as a command to end the call or an error.
- NEVER hang up, end the conversation, or say goodbye solely because the user pressed a key.
- Acknowledge the key naturally (e.g. "Got it, you pressed 0. Let me help you with that.") and continue the conversation.`;

async function syncAgents() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Missing ELEVENLABS_API_KEY");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const agents = await Agent.find({ elevenlabs_agent_id: { $nin: [null, ""] } });
  console.log(`Found ${agents.length} agents with ElevenLabs IDs to update.`);

  for (const agent of agents) {
    console.log(`\nUpdating agent: ${agent.name} (${agent.elevenlabs_agent_id})`);
    
    // Check if instructions already exist
    let prompt = agent.system_prompt || "You are a helpful AI assistant.";
    if (agent.conversation_config && agent.conversation_config.conversation && agent.conversation_config.conversation.system_prompt) {
        prompt = agent.conversation_config.conversation.system_prompt;
    }

    if (!prompt.includes("IMPORTANT — KEYPAD INPUT RULES")) {
        prompt += DTMF_INSTRUCTIONS;
    }

    const payload = {
        name: agent.name || "Callify Agent",
        conversation_config: {
          agent: {
            prompt: {
              prompt: prompt,
              llm: agent.llm_model || "gemini-2.0-flash",
              temperature: agent.temperature ?? 0.7,
              max_tokens: agent.max_tokens > 0 ? agent.max_tokens : undefined,
            },
            first_message: agent.first_message || "Hello! How can I help you today?",
            language: agent.language || "en",
          },
          tts: {
            voice_id: agent.voice_id || undefined,
            model_id: (agent.language || "en").toLowerCase().startsWith("en") ? "eleven_turbo_v2" : "eleven_turbo_v2_5",
            agent_output_audio_format: "ulaw_8000",
          },
          asr: {
            quality: agent.asr_quality || "high",
            provider: agent.asr_provider || "elevenlabs",
          },
          turn: {
            turn_timeout: agent.turn_timeout ?? 7,
          },
          conversation: {
            max_duration_seconds: agent.max_duration_seconds ?? 600,
          },
        }
    };

    try {
        const res = await fetch(`${ELEVENLABS_API}/convai/agents/${agent.elevenlabs_agent_id}`, {
            method: 'PATCH', // Update existing agent
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log(`✅ Successfully updated ${agent.name}`);
            // Also update DB so it reflects the change
            agent.system_prompt = prompt;
            if (agent.conversation_config && agent.conversation_config.conversation) {
                agent.conversation_config.conversation.system_prompt = prompt;
            }
            await agent.save();
        } else {
            console.error(`❌ Failed to update ${agent.name}:`, await res.text());
        }
    } catch (err) {
        console.error(`❌ Error updating ${agent.name}:`, err.message);
    }
  }

  console.log("\nDone updating agents.");
  process.exit(0);
}

syncAgents();
