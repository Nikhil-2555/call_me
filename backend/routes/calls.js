const router = require("express").Router();

/* POST /call/outbound — simulate starting an outbound call */
router.post("/outbound", async (req, res) => {
  try {
    const { agent_id, agent_phone_number_id, to_number } = req.body;

    if (!agent_id || !agent_phone_number_id || !to_number) {
      return res.status(400).json({ detail: "agent_id, agent_phone_number_id, and to_number are required" });
    }

    /* Simulate a successful outbound call initiation */
    res.json({
      call_id: `call_${Date.now()}`,
      status: "initiated",
      agent_id,
      to_number,
      message: "Outbound call initiated successfully",
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;
