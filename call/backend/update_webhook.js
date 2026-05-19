require("dotenv").config();
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const apiSecret = process.env.TWILIO_API_SECRET;
const publicUrl = process.env.PUBLIC_URL;

if (!publicUrl) {
  console.error("❌ PUBLIC_URL is missing in .env");
  process.exit(1);
}

const client = twilio(apiKeySid, apiSecret, { accountSid });

async function updateWebhooks() {
  try {
    const numbers = await client.incomingPhoneNumbers.list();
    if (numbers.length === 0) {
      console.log("No Twilio numbers found in your account.");
      return;
    }

    const webhookUrl = `${publicUrl}/call/incoming`;

    for (const number of numbers) {
      await client.incomingPhoneNumbers(number.sid).update({
        voiceUrl: webhookUrl,
      });
      console.log(`✅ Successfully updated webhook for ${number.phoneNumber} to ${webhookUrl}`);
    }
  } catch (err) {
    console.error("❌ Failed to update webhooks:", err.message);
  }
}

updateWebhooks();
