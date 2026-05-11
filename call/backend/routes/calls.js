const router = require("express").Router();
const WebSocket = require("ws");

const PhoneNumber = require("../models/PhoneNumber");
const twilio = require("twilio");

/* POST /call/outbound — initiate an outbound call via Twilio */
router.post("/outbound", async (req, res) => {
  try {
    const { agent_id, agent_phone_number_id, to_number } = req.body;

    if (!agent_id || !agent_phone_number_id || !to_number) {
      return res.status(400).json({ detail: "agent_id, agent_phone_number_id, and to_number are required" });
    }

    const phone = await PhoneNumber.findOne({ phone_number_id: agent_phone_number_id });
    if (!phone) {
      return res.status(404).json({ detail: "Phone number not found" });
    }

    // Use Twilio API Key authentication (API Key SID + Secret + Account SID)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_SECRET;

    if (!accountSid || !apiKeySid || !apiKeySecret) {
      return res.status(400).json({ detail: "TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, and TWILIO_API_SECRET must be set in .env" });
    }

    const client = twilio(apiKeySid, apiKeySecret, { accountSid });
    
    // Construct TwiML directly for the outbound call
    const host = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/^https?:\/\//, '') : req.headers.host;
    const twiml = `
      <Response>
        <Connect>
          <Stream url="wss://${host}/call/stream" />
        </Connect>
      </Response>
    `;

    const call = await client.calls.create({
      twiml: twiml,
      to: to_number,
      from: phone.phone_number,
    });

    res.json({
      call_id: call.sid,
      status: call.status,
      agent_id,
      to_number,
      message: "Outbound call initiated successfully",
    });
  } catch (err) {
    console.error("Outbound Call Error:", err);
    res.status(500).json({ detail: err.message });
  }
});

/* POST /call/incoming — Twilio Voice Webhook */
router.post("/incoming", (req, res) => {
  // Twilio sends a POST request here when someone calls the Twilio number.
  // We reply with TwiML to connect the call to our WebSocket stream.
  const host = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/^https?:\/\//, '') : req.headers.host;
  
  const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://${host}/call/stream" />
      </Connect>
    </Response>
  `;
  
  res.type("text/xml");
  res.send(twiml);
});

/* WS /call/stream — WebSocket endpoint for Twilio Media Streams */
router.ws("/stream", (ws, req) => {
  console.log("📞 Twilio connected to stream");
  let elevenLabsWs = null;

  // Ensure ELEVENLABS_AGENT_ID is defined in your .env
  const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID || "YOUR_ELEVENLABS_AGENT_ID";
  
  // Connect to ElevenLabs Conversational AI
  const elevenLabsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${ELEVENLABS_AGENT_ID}`;
  
  elevenLabsWs = new WebSocket(elevenLabsUrl);

  elevenLabsWs.on("open", () => {
    console.log("⚡ Connected to ElevenLabs Conversational AI");
  });

  elevenLabsWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      
      // ElevenLabs sends audio encoded as base64 in the 'audio_event'
      if (msg.type === "audio" && msg.audio_event && msg.audio_event.audio_base_64) {
        // Send the audio back to Twilio
        const twilioMsg = {
          event: "media",
          streamSid: ws.streamSid,
          media: {
            payload: msg.audio_event.audio_base_64
          }
        };
        
        if (ws.streamSid) {
          ws.send(JSON.stringify(twilioMsg));
        }
      }
    } catch (e) {
      console.error("Error parsing ElevenLabs message:", e);
    }
  });

  elevenLabsWs.on("close", () => {
    console.log("❌ ElevenLabs disconnected");
    ws.close();
  });

  elevenLabsWs.on("error", (error) => {
    console.error("ElevenLabs WebSocket Error:", error);
  });

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.event) {
        case "start":
          // Twilio has started the stream, capture the streamSid
          ws.streamSid = msg.start.streamSid;
          console.log(`🟢 Stream started: ${ws.streamSid}`);
          break;
        
        case "media":
          // Twilio sends media. We pass it to ElevenLabs.
          // Note: Twilio sends ulaw 8000Hz base64 audio by default. 
          // ElevenLabs Conversational AI supports this natively.
          if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
            const audioData = {
              user_audio_chunk: msg.media.payload
            };
            elevenLabsWs.send(JSON.stringify(audioData));
          }
          break;

        case "stop":
          console.log("🛑 Twilio stream stopped");
          if (elevenLabsWs) elevenLabsWs.close();
          break;
      }
    } catch (e) {
      console.error("Error handling Twilio message:", e);
    }
  });

  ws.on("close", () => {
    console.log("🛑 Twilio stream closed");
    if (elevenLabsWs) elevenLabsWs.close();
  });
});

module.exports = router;
