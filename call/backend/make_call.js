require("dotenv").config();
const twilio = require("twilio");
const mongoose = require("mongoose");

async function makeTestCall() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Agent = require("./models/Agent");
  const PhoneNumber = require("./models/PhoneNumber");

  const client = twilio(
    process.env.TWILIO_API_KEY_SID,
    process.env.TWILIO_API_SECRET,
    { accountSid: process.env.TWILIO_ACCOUNT_SID }
  );

  // Get first agent with an ElevenLabs ID
  const agent = await Agent.findOne({
    elevenlabs_agent_id: { $nin: [null, ""] },
  });
  console.log("Agent:", agent.name, "EL ID:", agent.elevenlabs_agent_id);

  const phone = await PhoneNumber.findOne({}).lean();
  console.log("From:", phone.phone_number);

  const host = process.env.PUBLIC_URL.replace(/^https?:\/\//, "");
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: node make_call.js +91XXXXXXXXXX");
    process.exit(1);
  }

  const twiml = `<Response><Connect><Stream url="wss://${host}/call/stream"><Parameter name="agent_id" value="${agent.agent_id}" /></Stream></Connect></Response>`;
  console.log("TwiML:", twiml);
  console.log("Calling", to, "...");

  const call = await client.calls.create({
    twiml,
    to,
    from: phone.phone_number,
  });

  console.log("Call SID:", call.sid);
  console.log("Status:", call.status);
  process.exit(0);
}

makeTestCall().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
