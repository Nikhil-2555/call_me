const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const PhoneNumber = require("../models/PhoneNumber");
const Agent = require("../models/Agent");

/* GET /phone-numbers — list all phone numbers */
router.get("/", async (req, res) => {
  try {
    const pageSize = parseInt(req.query.page_size) || 100;
    const numbers = await PhoneNumber.find().limit(pageSize).lean();

    /* Clean up null assigned_agent fields */
    const cleaned = numbers.map((n) => ({
      phone_number_id: n.phone_number_id,
      phone_number: n.phone_number,
      label: n.label,
      supports_inbound: n.supports_inbound,
      supports_outbound: n.supports_outbound,
      assigned_agent:
        n.assigned_agent && n.assigned_agent.agent_id
          ? n.assigned_agent
          : null,
      provider: n.provider,
    }));

    res.json(cleaned);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* POST /phone-numbers/import — import a Twilio number */
router.post("/import", async (req, res) => {
  try {
    const { phone_number, label, sid, token } = req.body;

    if (!phone_number || !label) {
      return res.status(400).json({ detail: "phone_number and label are required" });
    }

    const existing = await PhoneNumber.findOne({ phone_number });
    if (existing) {
      return res.status(409).json({ detail: "Phone number already imported" });
    }

    const phoneNum = await PhoneNumber.create({
      phone_number_id: uuidv4(),
      phone_number,
      label,
      sid: sid || "",
      token: token || "",
    });

    res.status(201).json({
      phone_number_id: phoneNum.phone_number_id,
      phone_number: phoneNum.phone_number,
      label: phoneNum.label,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* POST /phone-numbers/:id — update phone number settings */
router.post("/:id", async (req, res) => {
  try {
    const { assigned_agent_id, supports_inbound, supports_outbound } = req.body;

    const updateFields = {};
    if (typeof supports_inbound === "boolean") updateFields.supports_inbound = supports_inbound;
    if (typeof supports_outbound === "boolean") updateFields.supports_outbound = supports_outbound;

    if (assigned_agent_id) {
      const agent = await Agent.findOne({ agent_id: assigned_agent_id }).lean();
      if (agent) {
        updateFields.assigned_agent = {
          agent_id: agent.agent_id,
          agent_name: agent.name,
        };
      }
    }

    const updated = await PhoneNumber.findOneAndUpdate(
      { phone_number_id: req.params.id },
      { $set: updateFields },
      { new: true, lean: true }
    );

    if (!updated) return res.status(404).json({ detail: "Phone number not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;
