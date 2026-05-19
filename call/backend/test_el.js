const WebSocket = require('ws');
require('dotenv').config();

async function testElevenLabs() {
  const elKey = process.env.ELEVENLABS_API_KEY;
  const agentId = "agent_4901kre5g984e7jt593x9qhq127b";

  console.log("Getting signed URL...");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: { "xi-api-key": elKey } }
  );
  
  if (!res.ok) {
    console.error("Failed to get signed URL:", await res.text());
    return;
  }
  
  const data = await res.json();
  const signedUrl = data.signed_url;
  console.log("Signed URL received. Connecting...");

  const ws = new WebSocket(signedUrl);

  ws.on('open', () => {
    console.log("WebSocket connected!");
    // Send init
    ws.send(JSON.stringify({
      type: "conversation_initiation_client_data",
      conversation_config_override: {
        agent: { prompt: { prompt: "Test prompt" } }
      }
    }));
  });

  ws.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    console.log("Received:", data.type);
    if (data.type === "conversation_initiation_metadata") {
       console.log("Init successful. Waiting 3s...");
       setTimeout(() => {
         console.log("Sending user_message...");
         ws.send(JSON.stringify({
           type: "user_message",
           text: "User pressed keypad: 0"
         }));
       }, 3000);
    }
  });

  ws.on('close', (code, reason) => {
    console.log("WebSocket closed", code, reason.toString());
  });

  ws.on('error', console.error);
}

testElevenLabs();
