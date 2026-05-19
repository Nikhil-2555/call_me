require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const PhoneNumber = require("./models/PhoneNumber");

  // Delete fake/demo phone numbers that don't actually belong to the Twilio account
  const fakeNumbers = ["+1-415-555-0100", "+1-415-555-0200", "+1-415-555-0300"];
  const result = await PhoneNumber.deleteMany({ phone_number: { $in: fakeNumbers } });
  console.log(`Deleted ${result.deletedCount} fake phone numbers.`);

  // Also update the real number to have Admission Agent assigned (it already does, just confirm)
  const real = await PhoneNumber.findOne({ phone_number: "+16514619475" });
  console.log("Real number:", real.phone_number, "-> Agent:", real.assigned_agent.agent_name);

  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
