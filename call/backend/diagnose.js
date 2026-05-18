/**
 * Diagnostic Script — tests all critical integrations
 * Run: node diagnose.js
 */
require("dotenv").config();

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const GOOGLE_GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(color, icon, label, msg) {
  console.log(`${color}${icon} [${label}]${colors.reset} ${msg}`);
}
function ok(label, msg) { log(colors.green, "✅", label, msg); }
function fail(label, msg) { log(colors.red, "❌", label, msg); }
function warn(label, msg) { log(colors.yellow, "⚠️ ", label, msg); }
function info(label, msg) { log(colors.cyan, "ℹ️ ", label, msg); }

async function runDiagnostics() {
  console.log(`\n${colors.bold}========================================${colors.reset}`);
  console.log(`${colors.bold}   CALLIFY — FULL SYSTEM DIAGNOSTIC${colors.reset}`);
  console.log(`${colors.bold}========================================${colors.reset}\n`);

  /* ── 1. ENV Variables ── */
  console.log(`${colors.bold}── 1. Environment Variables ──${colors.reset}`);
  const envVars = {
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY_SID: process.env.TWILIO_API_KEY_SID,
    TWILIO_API_SECRET: process.env.TWILIO_API_SECRET,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    PUBLIC_URL: process.env.PUBLIC_URL,
    MONGODB_URI: process.env.MONGODB_URI,
    PORT: process.env.PORT,
  };
  for (const [key, val] of Object.entries(envVars)) {
    if (val && val.trim()) {
      ok("ENV", `${key} = ${val.slice(0, 20)}...`);
    } else {
      fail("ENV", `${key} is MISSING or EMPTY`);
    }
  }

  /* ── 2. ElevenLabs API Key Validity ── */
  console.log(`\n${colors.bold}── 2. ElevenLabs API Tests ──${colors.reset}`);
  const elevenKey = process.env.ELEVENLABS_API_KEY;

  // 2a. User info / account check
  try {
    const res = await fetch(`${ELEVENLABS_API}/user`, {
      headers: { "xi-api-key": elevenKey },
    });
    const data = await res.json();
    if (res.ok) {
      ok("ElevenLabs", `API Key VALID — User: ${data.xi_api_key || data.email || "authenticated"}`);
      if (data.subscription) {
        info("ElevenLabs", `Plan: ${data.subscription.tier || "unknown"} | Characters remaining: ${data.subscription.character_count_remaining ?? "N/A"}`);
      }
    } else {
      fail("ElevenLabs", `API Key INVALID — HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    }
  } catch (err) {
    fail("ElevenLabs", `User endpoint request FAILED: ${err.message}`);
  }

  // 2b. List voices
  try {
    const res = await fetch(`${ELEVENLABS_API}/voices`, {
      headers: { "xi-api-key": elevenKey },
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.voices)) {
      ok("ElevenLabs Voices", `Voices endpoint working — ${data.voices.length} voices available`);
    } else {
      fail("ElevenLabs Voices", `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    }
  } catch (err) {
    fail("ElevenLabs Voices", `Request failed: ${err.message}`);
  }

  // 2c. List ConvAI agents
  let firstAgentId = null;
  try {
    const res = await fetch(`${ELEVENLABS_API}/convai/agents?page_size=5`, {
      headers: { "xi-api-key": elevenKey },
    });
    const data = await res.json();
    if (res.ok) {
      const agentList = data.agents || [];
      ok("ElevenLabs ConvAI", `Agents endpoint working — ${agentList.length} agents found`);
      if (agentList.length > 0) {
        firstAgentId = agentList[0].agent_id;
        info("ElevenLabs ConvAI", `First agent: ${agentList[0].name} (${firstAgentId})`);
      }
    } else {
      fail("ElevenLabs ConvAI", `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    }
  } catch (err) {
    fail("ElevenLabs ConvAI", `Agents list request failed: ${err.message}`);
  }

  // 2d. Try to create a test ConvAI agent
  let createdTestAgentId = null;
  try {
    const testBody = {
      name: "DIAG_TEST_AGENT_DELETE_ME",
      conversation_config: {
        agent: {
          prompt: {
            prompt: "You are a test agent for diagnostics.",
            llm: "gemini-2.0-flash",
            temperature: 0.7,
          },
          first_message: "Hello, I'm a test agent.",
          language: "en",
        },
        tts: {
          model_id: "eleven_turbo_v2",
        },
        asr: {
          quality: "high",
          provider: "elevenlabs",
        },
        turn: { turn_timeout: 7 },
        conversation: { max_duration_seconds: 60 },
      },
    };
    const res = await fetch(`${ELEVENLABS_API}/convai/agents/create`, {
      method: "POST",
      headers: {
        "xi-api-key": elevenKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testBody),
    });
    const data = await res.json();
    if (res.ok && data.agent_id) {
      createdTestAgentId = data.agent_id;
      ok("ElevenLabs CreateAgent", `Agent creation WORKS — ID: ${createdTestAgentId}`);
    } else {
      fail("ElevenLabs CreateAgent", `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    }
  } catch (err) {
    fail("ElevenLabs CreateAgent", `Agent creation request failed: ${err.message}`);
  }

  // 2e. Get signed URL for the test agent
  if (createdTestAgentId) {
    try {
      const res = await fetch(
        `${ELEVENLABS_API}/convai/conversation/get_signed_url?agent_id=${createdTestAgentId}`,
        { headers: { "xi-api-key": elevenKey } }
      );
      const data = await res.json();
      if (res.ok && data.signed_url) {
        ok("ElevenLabs SignedURL", `Signed URL obtained successfully`);
        info("ElevenLabs SignedURL", `URL starts: ${data.signed_url.slice(0, 60)}...`);
      } else {
        fail("ElevenLabs SignedURL", `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
      }
    } catch (err) {
      fail("ElevenLabs SignedURL", `Signed URL request failed: ${err.message}`);
    }

    // Cleanup: delete test agent
    try {
      const res = await fetch(`${ELEVENLABS_API}/convai/agents/${createdTestAgentId}`, {
        method: "DELETE",
        headers: { "xi-api-key": elevenKey },
      });
      if (res.ok || res.status === 204) {
        info("ElevenLabs Cleanup", `Test agent deleted (${createdTestAgentId})`);
      } else {
        warn("ElevenLabs Cleanup", `Could not delete test agent: HTTP ${res.status}`);
      }
    } catch (err) {
      warn("ElevenLabs Cleanup", `Delete request failed: ${err.message}`);
    }
  }

  // 2f. Get signed URL for first existing agent (if any)
  if (firstAgentId) {
    try {
      const res = await fetch(
        `${ELEVENLABS_API}/convai/conversation/get_signed_url?agent_id=${firstAgentId}`,
        { headers: { "xi-api-key": elevenKey } }
      );
      const data = await res.json();
      if (res.ok && data.signed_url) {
        ok("ElevenLabs ExistingAgent", `Signed URL for existing agent works (${firstAgentId})`);
      } else {
        fail("ElevenLabs ExistingAgent", `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
      }
    } catch (err) {
      fail("ElevenLabs ExistingAgent", `Request failed: ${err.message}`);
    }
  }

  /* ── 3. Google Gemini API ── */
  console.log(`\n${colors.bold}── 3. Google Gemini API ──${colors.reset}`);
  try {
    const res = await fetch(GOOGLE_GEMINI_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GOOGLE_GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Reply with just: OK" }],
        temperature: 0.1,
        max_tokens: 5,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const reply = data?.choices?.[0]?.message?.content;
      ok("Gemini", `API working — Response: "${reply || "(empty)"}"`);
    } else {
      fail("Gemini", `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    }
  } catch (err) {
    fail("Gemini", `Request failed: ${err.message}`);
  }

  /* ── 4. Twilio Account Validation ── */
  console.log(`\n${colors.bold}── 4. Twilio API ──${colors.reset}`);
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_SECRET;

    const credentials = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    const data = await res.json();
    if (res.ok) {
      ok("Twilio", `Account valid — SID: ${data.sid}, Status: ${data.status}`);
      info("Twilio", `Friendly Name: ${data.friendly_name}`);
    } else {
      fail("Twilio", `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    }
  } catch (err) {
    fail("Twilio", `Request failed: ${err.message}`);
  }

  /* ── 5. ngrok / PUBLIC_URL check ── */
  console.log(`\n${colors.bold}── 5. PUBLIC_URL / ngrok ──${colors.reset}`);
  const publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl || !publicUrl.trim()) {
    fail("PUBLIC_URL", "Not set — Twilio webhooks will NOT work");
  } else {
    try {
      const res = await fetch(`${publicUrl}/health`, { signal: AbortSignal.timeout(7000) });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        ok("PUBLIC_URL", `${publicUrl} reachable and backend is live`);
      } else {
        warn("PUBLIC_URL", `${publicUrl}/health returned HTTP ${res.status} — backend may not be running`);
      }
    } catch (err) {
      warn("PUBLIC_URL", `Could not reach ${publicUrl}/health — backend may be offline or ngrok not running: ${err.message}`);
    }
  }

  /* ── 6. MongoDB ── */
  console.log(`\n${colors.bold}── 6. MongoDB ──${colors.reset}`);
  try {
    const mongoose = require("mongoose");
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    ok("MongoDB", `Connected to ${process.env.MONGODB_URI}`);
    // Quick collection check
    const Agent = require("./models/Agent");
    const count = await Agent.countDocuments();
    info("MongoDB", `Agents collection: ${count} document(s)`);
    await mongoose.disconnect();
  } catch (err) {
    fail("MongoDB", `Connection failed: ${err.message}`);
  }

  console.log(`\n${colors.bold}========================================${colors.reset}`);
  console.log(`${colors.bold}          DIAGNOSTIC COMPLETE${colors.reset}`);
  console.log(`${colors.bold}========================================${colors.reset}\n`);
}

runDiagnostics().catch((err) => {
  console.error("Fatal diagnostic error:", err);
  process.exit(1);
});
