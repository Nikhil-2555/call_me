/**
 * ═══════════════════════════════════════════════════════════════
 *  Callify Full Diagnostics  — NO Twilio credits spent
 *  Usage:  node diagnose.mjs
 * ═══════════════════════════════════════════════════════════════
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";
import path from "path";          

const require = createRequire(import.meta.url);
require("dotenv").config();

// Load mongoose models via CJS require (they use require internally)
const mongoose = require("mongoose");

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const TWILIO_BASE    = "https://api.twilio.com/2010-04-01";

let passed = 0, failed = 0, warned = 0;

const ok   = (m) => { console.log(`  ✅  ${m}`); passed++; };
const fail = (m) => { console.log(`  ❌  ${m}`); failed++; };
const warn = (m) => { console.log(`  ⚠️   ${m}`); warned++; };
const section = (t) => console.log(`\n${"─".repeat(60)}\n  ${t}\n${"─".repeat(60)}`);

async function getJson(url, opts = {}) {
  const res  = await fetch(url, opts);
  const text = await res.text();
  let json;  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, ok: res.ok, json, text };
}

/* ══════════════════════════════════════════════════════════
 *  1. Environment Variables
 * ══════════════════════════════════════════════════════════ */
section("1 / 6  —  Environment Variables");

const ENV = {
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID: process.env.TWILIO_API_KEY_SID,
  TWILIO_API_SECRET:  process.env.TWILIO_API_SECRET,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  MONGODB_URI:        process.env.MONGODB_URI,
  PUBLIC_URL:         process.env.PUBLIC_URL,
};

for (const [k, v] of Object.entries(ENV)) {
  if (v?.trim()) ok(`${k} is set`);
  else           fail(`${k} is MISSING or empty`);
}

/* ══════════════════════════════════════════════════════════
 *  2. MongoDB
 * ══════════════════════════════════════════════════════════ */
section("2 / 6  —  MongoDB Connection & Collections");

let agents = [], phones = [];

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  ok("MongoDB connected");

  const Agent       = require("./models/Agent");
  const PhoneNumber = require("./models/PhoneNumber");

  agents = await Agent.find().lean();
  phones = await PhoneNumber.find().lean();

  if (agents.length > 0) {
    ok(`Agents in DB: ${agents.length}`);
    for (const a of agents) {
      const el = a.elevenlabs_agent_id ? `EL:${a.elevenlabs_agent_id.slice(0,14)}…` : "⚠️  NO ElevenLabs ID";
      console.log(`       • ${a.name.padEnd(28)} ${el}`);
    }
  } else {
    warn("No agents in DB — create one via the UI first");
  }

  if (phones.length > 0) {
    ok(`Phone numbers in DB: ${phones.length}`);
    for (const p of phones) {
      const aName = p.assigned_agent?.agent_name || "not assigned ⚠️";
      console.log(`       • ${(p.phone_number||"").padEnd(18)} → agent: ${aName}`);
    }
  } else {
    warn("No phone numbers in DB — add one in Phone Numbers page");
  }

  await mongoose.disconnect();
} catch (err) {
  fail(`MongoDB error: ${err.message}`);
}

/* ══════════════════════════════════════════════════════════
 *  3. ElevenLabs API
 * ══════════════════════════════════════════════════════════ */
section("3 / 6  —  ElevenLabs API");

const EL_KEY = process.env.ELEVENLABS_API_KEY;

if (!EL_KEY?.trim()) {
  fail("Skipping ElevenLabs tests — key missing");
} else {
  // 3a. Validate key
  try {
    const { status, ok: isOk, json } = await getJson(`${ELEVENLABS_API}/user`, {
      headers: { "xi-api-key": EL_KEY },
    });
    if (isOk) {
      const tier   = json?.subscription?.tier ?? "unknown";
      const used   = json?.subscription?.character_count ?? "?";
      const limit  = json?.subscription?.character_limit ?? "?";
      const pct    = typeof used === "number" && typeof limit === "number"
                     ? ` (${((used/limit)*100).toFixed(1)}%)` : "";
      ok(`ElevenLabs API key valid — tier: ${tier}`);
      ok(`ElevenLabs character usage: ${used}/${limit}${pct}`);
    } else {
      fail(`ElevenLabs API key rejected (HTTP ${status})`);
    }
  } catch (e) { fail(`ElevenLabs /user: ${e.message}`); }

  // 3b. Voices
  try {
    const { ok: isOk, json } = await getJson(`${ELEVENLABS_API}/voices`, {
      headers: { "xi-api-key": EL_KEY },
    });
    if (isOk && json?.voices?.length) ok(`ElevenLabs voices: ${json.voices.length} available`);
    else warn("ElevenLabs returned no voices");
  } catch (e) { fail(`ElevenLabs /voices: ${e.message}`); }

  // 3c. ConvAI agents list
  let elAgents = [];
  try {
    const { ok: isOk, json } = await getJson(`${ELEVENLABS_API}/convai/agents`, {
      headers: { "xi-api-key": EL_KEY },
    });
    if (isOk) {
      elAgents = json?.agents ?? [];
      ok(`ElevenLabs ConvAI agents on account: ${elAgents.length}`);
    } else {
      warn(`ConvAI agents list returned non-200`);
    }
  } catch (e) { fail(`ElevenLabs ConvAI agents: ${e.message}`); }

  // 3d. Signed URL for each DB agent that has an EL ID
  const agentsWithEl = agents.filter(a => a.elevenlabs_agent_id);
  if (agentsWithEl.length === 0 && agents.length > 0) {
    warn("None of your DB agents have an ElevenLabs agent ID yet — they will be created on first call");
  }
  for (const a of agentsWithEl) {
    try {
      const { ok: isOk, json, text, status } = await getJson(
        `${ELEVENLABS_API}/convai/conversation/get_signed_url?agent_id=${a.elevenlabs_agent_id}`,
        { headers: { "xi-api-key": EL_KEY } }
      );
      if (isOk && json?.signed_url) {
        ok(`Signed WebSocket URL OK for "${a.name}"`);
      } else {
        fail(`Signed URL FAILED for "${a.name}" (HTTP ${status}): ${text.slice(0,120)}`);
      }
    } catch (e) { fail(`Signed URL error for "${a.name}": ${e.message}`); }
  }
}

/* ══════════════════════════════════════════════════════════
 *  4. Twilio — NO CALLS MADE
 * ══════════════════════════════════════════════════════════ */
section("4 / 6  —  Twilio Credentials & Balance");

const T_SID    = process.env.TWILIO_ACCOUNT_SID;
const T_KEY    = process.env.TWILIO_API_KEY_SID;
const T_SECRET = process.env.TWILIO_API_SECRET;

if (!T_SID || !T_KEY || !T_SECRET) {
  fail("Skipping Twilio tests — credentials missing");
} else {
  const auth = "Basic " + Buffer.from(`${T_KEY}:${T_SECRET}`).toString("base64");

  // 4a. Verify account
  try {
    const { ok: isOk, json, status } = await getJson(
      `${TWILIO_BASE}/Accounts/${T_SID}.json`,
      { headers: { Authorization: auth } }
    );
    if (isOk) ok(`Twilio account valid: "${json.friendly_name}" — status: ${json.status}`);
    else       fail(`Twilio auth failed (HTTP ${status}): ${JSON.stringify(json).slice(0,120)}`);
  } catch (e) { fail(`Twilio account: ${e.message}`); }

  // 4b. Balance check
  try {
    const { ok: isOk, json } = await getJson(
      `${TWILIO_BASE}/Accounts/${T_SID}/Balance.json`,
      { headers: { Authorization: auth } }
    );
    if (isOk) {
      const bal = parseFloat(json.balance);
      const cur = json.currency;
      if (bal > 1.5)     ok(`Twilio balance: ${bal.toFixed(4)} ${cur} ✓`);
      else if (bal > 0)  warn(`Twilio balance LOW: ${bal.toFixed(4)} ${cur} — please top up!`);
      else               fail(`Twilio balance is ZERO (${bal} ${cur}) — calls will fail immediately`);
    }
  } catch (e) { warn(`Could not fetch Twilio balance: ${e.message}`); }

  // 4c. Phone numbers on Twilio account
  try {
    const { ok: isOk, json } = await getJson(
      `${TWILIO_BASE}/Accounts/${T_SID}/IncomingPhoneNumbers.json`,
      { headers: { Authorization: auth } }
    );
    if (isOk) {
      const nums = json.incoming_phone_numbers ?? [];
      if (nums.length) {
        ok(`Twilio purchased phone numbers: ${nums.length}`);
        for (const n of nums) {
          const voiceUrl = n.voice_url || "⚠️  NO webhook set";
          console.log(`       • ${n.phone_number.padEnd(18)} webhook: ${voiceUrl.slice(0,60)}`);
        }
      } else {
        warn("No Twilio numbers found — buy one at twilio.com/console");
      }
    }
  } catch (e) { fail(`Twilio numbers: ${e.message}`); }
}

/* ══════════════════════════════════════════════════════════
 *  5. Backend Endpoints (server must be running on :8000)
 * ══════════════════════════════════════════════════════════ */
section("5 / 6  —  Backend HTTP Endpoints (localhost:8000)");

const BACKEND = "http://localhost:8000";

for (const [method, url] of [
  ["GET",  "/health"],
  ["GET",  "/agents/"],
  ["GET",  "/voices"],
  ["GET",  "/phone-numbers"],
]) {
  try {
    const { status } = await getJson(`${BACKEND}${url}`, { method });
    if (status >= 200 && status < 300) ok(`${method} ${url}  →  HTTP ${status}`);
    else                                warn(`${method} ${url}  →  HTTP ${status}`);
  } catch {
    fail(`${method} ${url}  →  Cannot reach backend (is npm run dev running?)`);
  }
}

/* ══════════════════════════════════════════════════════════
 *  6. ngrok / PUBLIC_URL reachability
 * ══════════════════════════════════════════════════════════ */
section("6 / 6  —  Public URL & WebSocket Endpoint");

const PUB = process.env.PUBLIC_URL?.trim().replace(/\/$/, "");

if (!PUB) {
  fail("PUBLIC_URL not set in .env — Twilio cannot reach your webhook");
} else {
  // Health check through ngrok
  try {
    const { status } = await getJson(`${PUB}/health`);
    if (status === 200) ok(`PUBLIC_URL health check OK: ${PUB}`);
    else                fail(`PUBLIC_URL health returned HTTP ${status}`);
  } catch (e) {
    fail(`PUBLIC_URL not reachable: ${e.message.slice(0,80)} — is ngrok running?`);
  }

  // WebSocket endpoint probe (HTTP GET returns 400/426 = endpoint exists, awaiting WS upgrade)
  const wsUrl = PUB.replace(/^wss?:\/\//, "https://");
  try {
    const { status } = await getJson(`${wsUrl}/call/stream`);
    if ([400, 426].includes(status)) {
      ok(`/call/stream WebSocket endpoint exists (HTTP ${status} = upgrade required ✓)`);
    } else if (status === 200) {
      ok(`/call/stream endpoint OK (${status})`);
    } else {
      warn(`/call/stream returned HTTP ${status}`);
    }
  } catch (e) {
    warn(`WebSocket probe: ${e.message.slice(0,80)}`);
  }

  // Check incoming webhook is set on Twilio numbers
  if (T_SID && T_KEY && T_SECRET) {
    const auth2 = "Basic " + Buffer.from(`${T_KEY}:${T_SECRET}`).toString("base64");
    try {
      const { json } = await getJson(
        `${TWILIO_BASE}/Accounts/${T_SID}/IncomingPhoneNumbers.json`,
        { headers: { Authorization: auth2 } }
      );
      const nums = json?.incoming_phone_numbers ?? [];
      for (const n of nums) {
        const expectedPath = "/call/incoming";
        if (n.voice_url?.includes(PUB.replace(/^https?:\/\//, ""))) {
          ok(`Twilio webhook correctly points to ngrok for ${n.phone_number}`);
        } else {
          warn(`Twilio webhook for ${n.phone_number} is "${n.voice_url || "empty"}" — should be "${PUB}${expectedPath}"`);
        }
      }
    } catch { /* skip */ }
  }
}

/* ══════════════════════════════════════════════════════════
 *  Final Report
 * ══════════════════════════════════════════════════════════ */
console.log(`\n${"═".repeat(60)}`);
console.log(`  CALLIFY DIAGNOSTICS — FINAL RESULT`);
console.log(`${"═".repeat(60)}`);
console.log(`  ✅  Passed   : ${passed}`);
console.log(`  ⚠️   Warnings : ${warned}`);
console.log(`  ❌  Failed   : ${failed}`);
console.log(`${"═".repeat(60)}`);

if (failed === 0 && warned === 0)   console.log("  🎉  ALL CHECKS PASSED — system is ready!\n");
else if (failed === 0)              console.log("  ✅  No failures. Resolve warnings if possible.\n");
else                                console.log("  ❌  Fix failures above before making calls.\n");

process.exit(failed > 0 ? 1 : 0);
