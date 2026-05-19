/**
 * ═══════════════════════════════════════════════════════════════
 *  Callify Full Diagnostics  — runs WITHOUT spending Twilio credits
 *  Usage: node diagnose.js
 * ═══════════════════════════════════════════════════════════════
 */
require("dotenv").config();
const mongoose = require("mongoose");

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const TWILIO_BASE    = "https://api.twilio.com/2010-04-01";

let passed = 0, failed = 0, warned = 0;

function ok(msg)   { console.log(`  ✅  ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌  ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️   ${msg}`); warned++; }
function section(title) { console.log(`\n${"─".repeat(60)}\n  ${title}\n${"─".repeat(60)}`); }

/* ─── helpers ─── */
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, ok: res.ok, json, text };
}

async function b64Auth(sid, secret) {
  return "Basic " + Buffer.from(`${sid}:${secret}`).toString("base64");
}

/* ════════════════════════════════════════════════════════════════
 *  1. Environment Variables
 * ════════════════════════════════════════════════════════════════ */
section("1 / 6  —  Environment Variables");

const required = {
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID: process.env.TWILIO_API_KEY_SID,
  TWILIO_API_SECRET:  process.env.TWILIO_API_SECRET,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  MONGODB_URI:        process.env.MONGODB_URI,
  PUBLIC_URL:         process.env.PUBLIC_URL,
};

for (const [k, v] of Object.entries(required)) {
  if (v && v.trim()) ok(`${k} is set`);
  else                fail(`${k} is MISSING`);
}

/* ════════════════════════════════════════════════════════════════
 *  2. MongoDB
 * ════════════════════════════════════════════════════════════════ */
section("2 / 6  —  MongoDB Connection & Data");

let agents = [], phones = [];

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  ok("MongoDB connected successfully");

  const Agent       = require("./models/Agent");
  const PhoneNumber = require("./models/PhoneNumber");

  agents = await Agent.find().lean();
  phones = await PhoneNumber.find().lean();

  if (agents.length > 0) {
    ok(`Found ${agents.length} agent(s) in DB`);
    for (const a of agents) {
      const hasEl = a.elevenlabs_agent_id ? `EL:${a.elevenlabs_agent_id.slice(0,12)}…` : "NO ElevenLabs ID";
      console.log(`     • ${a.name.padEnd(30)} ${hasEl}`);
    }
  } else {
    warn("No agents found in DB — create one first");
  }

  if (phones.length > 0) {
    ok(`Found ${phones.length} phone number(s) in DB`);
    for (const p of phones) {
      const assigned = p.assigned_agent?.agent_name || "— not assigned";
      console.log(`     • ${p.phone_number.padEnd(18)} → ${assigned}`);
    }
  } else {
    warn("No phone numbers found in DB — add one first");
  }

  await mongoose.disconnect();
} catch (err) {
  fail(`MongoDB error: ${err.message}`);
}

/* ════════════════════════════════════════════════════════════════
 *  3. ElevenLabs API
 * ════════════════════════════════════════════════════════════════ */
section("3 / 6  —  ElevenLabs API");

const elKey = process.env.ELEVENLABS_API_KEY;

if (!elKey) {
  fail("Skipping ElevenLabs tests — API key missing");
} else {
  // 3a. Validate API key via /user endpoint
  try {
    const { status, ok: isOk, json } = await fetchJson(`${ELEVENLABS_API}/user`, {
      headers: { "xi-api-key": elKey },
    });
    if (isOk) {
      ok(`ElevenLabs API key is valid (subscription: ${json?.subscription?.tier || "unknown"})`);
      const chars = json?.subscription?.character_limit;
      const used  = json?.subscription?.character_count;
      if (chars != null) {
        const pct = ((used / chars) * 100).toFixed(1);
        ok(`ElevenLabs character usage: ${used}/${chars} (${pct}%)`);
      }
    } else {
      fail(`ElevenLabs API key invalid (${status})`);
    }
  } catch (err) {
    fail(`ElevenLabs /user request failed: ${err.message}`);
  }

  // 3b. List voices
  try {
    const { ok: isOk, json } = await fetchJson(`${ELEVENLABS_API}/voices`, {
      headers: { "xi-api-key": elKey },
    });
    if (isOk && json?.voices?.length > 0) {
      ok(`ElevenLabs voices available: ${json.voices.length} voice(s)`);
    } else {
      warn("No voices returned from ElevenLabs");
    }
  } catch (err) {
    fail(`ElevenLabs /voices request failed: ${err.message}`);
  }

  // 3c. List ConvAI agents
  try {
    const { ok: isOk, json } = await fetchJson(`${ELEVENLABS_API}/convai/agents`, {
      headers: { "xi-api-key": elKey },
    });
    if (isOk) {
      const count = json?.agents?.length ?? 0;
      ok(`ElevenLabs ConvAI agents: ${count} agent(s) on your account`);

      // 3d. Get signed URL for each agent that has an EL ID
      for (const dbAgent of agents.filter(a => a.elevenlabs_agent_id)) {
        try {
          const r = await fetchJson(
            `${ELEVENLABS_API}/convai/conversation/get_signed_url?agent_id=${dbAgent.elevenlabs_agent_id}`,
            { headers: { "xi-api-key": elKey } }
          );
          if (r.ok && r.json?.signed_url) {
            ok(`Signed WebSocket URL OK for agent "${dbAgent.name}"`);
          } else {
            fail(`Signed URL failed for "${dbAgent.name}" (${r.status}): ${r.text.slice(0,120)}`);
          }
        } catch (err) {
          fail(`Signed URL error for "${dbAgent.name}": ${err.message}`);
        }
      }
    } else {
      warn(`ElevenLabs ConvAI agents list error: ${JSON.stringify(json).slice(0,200)}`);
    }
  } catch (err) {
    fail(`ElevenLabs ConvAI agents request failed: ${err.message}`);
  }
}

/* ════════════════════════════════════════════════════════════════
 *  4. Twilio Credentials (NO call made)
 * ════════════════════════════════════════════════════════════════ */
section("4 / 6  —  Twilio Credentials & Balance");

const tSid    = process.env.TWILIO_ACCOUNT_SID;
const tKeySid = process.env.TWILIO_API_KEY_SID;
const tSecret = process.env.TWILIO_API_SECRET;

if (!tSid || !tKeySid || !tSecret) {
  fail("Skipping Twilio tests — credentials missing");
} else {
  const auth = await b64Auth(tKeySid, tSecret);

  // 4a. Validate account
  try {
    const { status, ok: isOk, json } = await fetchJson(
      `${TWILIO_BASE}/Accounts/${tSid}.json`,
      { headers: { Authorization: auth } }
    );
    if (isOk) {
      ok(`Twilio account is valid: "${json.friendly_name}" (status: ${json.status})`);
    } else {
      fail(`Twilio credentials invalid (${status}): ${JSON.stringify(json).slice(0,150)}`);
    }
  } catch (err) {
    fail(`Twilio account check failed: ${err.message}`);
  }

  // 4b. Check balance
  try {
    const { ok: isOk, json } = await fetchJson(
      `${TWILIO_BASE}/Accounts/${tSid}/Balance.json`,
      { headers: { Authorization: auth } }
    );
    if (isOk) {
      const bal = parseFloat(json.balance);
      const cur = json.currency;
      if (bal > 1) {
        ok(`Twilio balance: ${bal.toFixed(3)} ${cur} — sufficient`);
      } else if (bal > 0) {
        warn(`Twilio balance LOW: ${bal.toFixed(3)} ${cur} — top up soon!`);
      } else {
        fail(`Twilio balance: ${bal} ${cur} — ZERO, calls will fail!`);
      }
    }
  } catch (err) {
    warn(`Could not fetch Twilio balance: ${err.message}`);
  }

  // 4c. List Twilio phone numbers
  try {
    const { ok: isOk, json } = await fetchJson(
      `${TWILIO_BASE}/Accounts/${tSid}/IncomingPhoneNumbers.json`,
      { headers: { Authorization: auth } }
    );
    if (isOk) {
      const nums = json.incoming_phone_numbers || [];
      if (nums.length > 0) {
        ok(`Twilio has ${nums.length} purchased phone number(s):`);
        for (const n of nums) {
          console.log(`     • ${n.phone_number.padEnd(18)} "${n.friendly_name}"`);
        }
      } else {
        warn("No Twilio phone numbers found — buy one in the Twilio console");
      }
    }
  } catch (err) {
    fail(`Twilio phone numbers check failed: ${err.message}`);
  }
}

/* ════════════════════════════════════════════════════════════════
 *  5. Backend HTTP Endpoints (server must be running)
 * ════════════════════════════════════════════════════════════════ */
section("5 / 6  —  Backend API Endpoints (localhost:8000)");

const BASE = "http://localhost:8000";

async function checkEndpoint(method, path, body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const { status, json } = await fetchJson(`${BASE}${path}`, opts);
    return { status, json };
  } catch {
    return { status: 0 };
  }
}

const endpoints = [
  ["GET",  "/health"],
  ["GET",  "/agents/"],
  ["GET",  "/voices"],
  ["GET",  "/phone-numbers"],
];

for (const [method, path] of endpoints) {
  const { status } = await checkEndpoint(method, path);
  if (status >= 200 && status < 300) ok(`${method} ${path}  →  HTTP ${status}`);
  else if (status === 0)             fail(`${method} ${path}  →  Server not reachable (is npm run dev running?)`);
  else                               warn(`${method} ${path}  →  HTTP ${status}`);
}

/* ════════════════════════════════════════════════════════════════
 *  6. ngrok / PUBLIC_URL
 * ════════════════════════════════════════════════════════════════ */
section("6 / 6  —  Public URL (ngrok) Reachability");

const publicUrl = process.env.PUBLIC_URL;
if (!publicUrl) {
  warn("PUBLIC_URL is not set — Twilio cannot call your webhook");
} else {
  try {
    const { status } = await fetchJson(`${publicUrl}/health`);
    if (status === 200)  ok(`PUBLIC_URL reachable: ${publicUrl}`);
    else                 fail(`PUBLIC_URL returned HTTP ${status}: ${publicUrl}`);
  } catch (err) {
    fail(`PUBLIC_URL not reachable: ${err.message.slice(0, 80)}`);
  }

  // Check WebSocket path is available (HTTP upgrade returns 426 or 101 headers exist)
  const wsHttp = publicUrl.replace(/^wss?:\/\//, "https://").replace(/^http:\/\//, "https://");
  try {
    const { status } = await fetchJson(`${wsHttp}/call/stream`);
    // 400/426 means the endpoint exists but needs WS upgrade — that's correct
    if ([400, 426].includes(status)) {
      ok(`WebSocket endpoint /call/stream is reachable at ngrok (HTTP ${status} = upgrade required ✓)`);
    } else if (status === 200) {
      ok(`/call/stream endpoint reachable (${status})`);
    } else {
      warn(`/call/stream returned HTTP ${status} — check if the route is registered`);
    }
  } catch (err) {
    warn(`Could not probe WebSocket endpoint: ${err.message.slice(0, 80)}`);
  }
}

/* ════════════════════════════════════════════════════════════════
 *  Final Report
 * ════════════════════════════════════════════════════════════════ */
console.log(`\n${"═".repeat(60)}`);
console.log(`  DIAGNOSTIC RESULT`);
console.log(`${"═".repeat(60)}`);
console.log(`  ✅  Passed  : ${passed}`);
console.log(`  ⚠️   Warnings: ${warned}`);
console.log(`  ❌  Failed  : ${failed}`);
console.log(`${"═".repeat(60)}`);

if (failed === 0 && warned === 0) {
  console.log("  🎉  ALL CHECKS PASSED — system is ready for calls!\n");
} else if (failed === 0) {
  console.log("  ✅  No hard failures — warnings should be addressed.\n");
} else {
  console.log("  ❌  Fix the failures above before making calls.\n");
}

process.exit(failed > 0 ? 1 : 0);
