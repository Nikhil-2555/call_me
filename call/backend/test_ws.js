const WebSocket = require('ws');
const mongoose = require('mongoose');
require('dotenv').config();

async function runTest() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Agent = require('./models/Agent');
  const agent = await Agent.findOne({ elevenlabs_agent_id: { $ne: null } });
  if (!agent) {
    console.error("No agent with elevenlabs_agent_id found.");
    process.exit(1);
  }

  const ws = new WebSocket('ws://localhost:8000/call/stream');

  ws.on('open', () => {
    ws.send(JSON.stringify({
      event: "start",
      start: {
        streamSid: "MZ1234567890",
        customParameters: { agent_id: agent.agent_id }
      }
    }));

    // Send 50 media packets a second (like Twilio)
    setInterval(() => {
      ws.send(JSON.stringify({
        event: "media",
        streamSid: "MZ1234567890",
        media: { payload: "f39/" } // fake base64
      }));
    }, 20);

    setTimeout(() => {
      console.log("Sending dtmf 0");
      ws.send(JSON.stringify({
        event: "dtmf",
        streamSid: "MZ1234567890",
        dtmf: { digit: "0", track: "inbound_track" }
      }));
    }, 4000);
  });

  ws.on('message', (msg) => {
    const json = JSON.parse(msg.toString());
    if (json.event === "clear") console.log("Received CLEAR");
  });

  ws.on('close', (code, reason) => {
    console.log("Local backend closed connection", code, reason.toString());
    process.exit(0);
  });
  
  ws.on('error', console.error);
}

runTest();
