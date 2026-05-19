/**
 * live_test.js — simulates EXACTLY what Twilio does during a call
 * Run: node live_test.js
 */
require("dotenv").config();
const WebSocket = require("ws");
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Agent = require("./models/Agent");
  const agent = await Agent.findOne({ elevenlabs_agent_id: { $nin: [null, ""] } });
  
  const host = process.env.PUBLIC_URL.replace(/^https?:\/\//, "");
  const url = `wss://${host}/call/stream`;
  
  console.log(`\nAgent: ${agent.name} (EL: ${agent.elevenlabs_agent_id})`);
  console.log(`Connecting to: ${url}\n`);

  const ws = new WebSocket(url);
  let step = 0;

  ws.on("open", () => {
    console.log("[1] WebSocket connected");

    // Step 1: Send Twilio 'connected' event (comes first always)
    ws.send(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));

    setTimeout(() => {
      // Step 2: Send 'start' event with agent_id (this triggers ElevenLabs connection)
      console.log("[2] Sending start event with agent_id:", agent.agent_id);
      ws.send(JSON.stringify({
        event: "start",
        sequenceNumber: "1",
        start: {
          streamSid: "MZ_TEST_1234567890",
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          callSid: "CA_TEST_1234567890",
          tracks: ["inbound"],
          customParameters: { agent_id: agent.agent_id },
          mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 }
        }
      }));
    }, 200);

    // Send fake audio every 20ms (just like Twilio does)
    const audioInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: "media",
          sequenceNumber: String(++step),
          streamSid: "MZ_TEST_1234567890",
          media: { track: "inbound", chunk: String(step), timestamp: String(step * 20), payload: "////fv///" }
        }));
      }
    }, 20);

    // Step 3: After 5 seconds, simulate user pressing '0'
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log("[3] Simulating user pressing '0' (DTMF)...");
        ws.send(JSON.stringify({
          event: "dtmf",
          streamSid: "MZ_TEST_1234567890",
          dtmf: { track: "inbound_track", digit: "0" }
        }));
      }
    }, 5000);

    // Step 4: Check if still alive after 8 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log("[4] Still connected after DTMF — DTMF is NOT causing disconnect ✅");
        console.log("    This means Twilio trial disclaimer is the real cause.");
      } else {
        console.log("[4] Connection CLOSED after DTMF — backend is disconnecting ❌");
      }
      clearInterval(audioInterval);
      ws.close();
      setTimeout(() => process.exit(0), 500);
    }, 8000);
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log(`   ← Backend sent: ${msg.event || msg.type || JSON.stringify(msg).slice(0, 80)}`);
    } catch {}
  });

  ws.on("close", (code, reason) => {
    console.log(`\n[!] WebSocket closed: code=${code} reason="${reason}"`);
    if (code === 1000) console.log("    Clean close (normal)");
    else console.log("    ABNORMAL CLOSE — backend is dropping the connection");
    process.exit(0);
  });

  ws.on("error", (e) => {
    console.error("[!] Error:", e.message);
    process.exit(1);
  });
}

run().catch((e) => { console.error(e); process.exit(1); });
