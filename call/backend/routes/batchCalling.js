const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const BatchCall = require("../models/BatchCall");
const Agent = require("../models/Agent");

/* GET /batch-calling/workspace — list batch calls */
router.get("/workspace", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const batches = await BatchCall.find()
      .sort({ created_at_unix: -1 })
      .limit(limit)
      .lean();

    const batch_calls = batches.map((b) => ({
      id: b.id,
      name: b.name,
      agent_name: b.agent_name,
      created_at_unix: b.created_at_unix,
      scheduled_time_unix: b.scheduled_time_unix,
      total_calls_scheduled: b.total_calls_scheduled,
      total_calls_dispatched: b.total_calls_dispatched,
      status: b.status,
    }));

    res.json({ batch_calls });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* POST /batch-calling/submit — create a new batch call */
router.post("/submit", async (req, res) => {
  try {
    const { call_name, agent_id, agent_phone_number_id, scheduled_time_unix, recipients } = req.body;

    if (!call_name || !agent_id || !recipients?.length) {
      return res.status(400).json({ detail: "call_name, agent_id, and recipients are required" });
    }

    /* Look up agent name */
    const agent = await Agent.findOne({ agent_id }).lean();
    const agentName = agent ? agent.name : "Unknown Agent";

    const batchId = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    const recipientDocs = recipients.map((r) => ({
      id: uuidv4(),
      phone_number: r.phone_number,
      status: "pending",
      created_at_unix: now,
      updated_at_unix: now,
      conversation_id: `conv_${uuidv4().replace(/-/g, "").slice(0, 24)}`,
    }));

    await BatchCall.create({
      id: batchId,
      name: call_name,
      agent_id,
      agent_name: agentName,
      agent_phone_number_id: agent_phone_number_id || "",
      status: scheduled_time_unix ? "pending" : "in_progress",
      total_calls_scheduled: recipientDocs.length,
      total_calls_dispatched: 0,
      scheduled_time_unix: scheduled_time_unix || null,
      created_at_unix: now,
      last_updated_at_unix: now,
      recipients: recipientDocs,
    });

    res.status(201).json({ batch_id: batchId });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* GET /batch-calling/:id/status — get batch status */
router.get("/:id/status", async (req, res) => {
  try {
    const batch = await BatchCall.findOne({ id: req.params.id }).lean();
    if (!batch) return res.status(404).json({ detail: "Batch not found" });

    res.json({
      id: batch.id,
      name: batch.name,
      status: batch.status,
      total_calls_dispatched: batch.total_calls_dispatched,
      total_calls_scheduled: batch.total_calls_scheduled,
      last_updated_at_unix: batch.last_updated_at_unix,
      created_at_unix: batch.created_at_unix,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* GET /batch-calling/:id/recipients — get batch recipients */
router.get("/:id/recipients", async (req, res) => {
  try {
    const batch = await BatchCall.findOne({ id: req.params.id }).lean();
    if (!batch) return res.status(404).json({ detail: "Batch not found" });

    res.json({
      batch_id: batch.id,
      recipients: batch.recipients || [],
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* POST /batch-calling/:id/cancel — cancel a batch */
router.post("/:id/cancel", async (req, res) => {
  try {
    const batch = await BatchCall.findOne({ id: req.params.id });
    if (!batch) return res.status(404).json({ detail: "Batch not found" });

    batch.status = "cancelled";
    batch.last_updated_at_unix = Math.floor(Date.now() / 1000);

    /* Cancel all pending recipients */
    batch.recipients.forEach((r) => {
      if (r.status === "pending" || r.status === "in_progress") {
        r.status = "cancelled";
        r.updated_at_unix = Math.floor(Date.now() / 1000);
      }
    });

    await batch.save();
    res.json({ message: "Batch cancelled", status: batch.status });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* POST /batch-calling/:id/retry — retry a failed/completed batch */
router.post("/:id/retry", async (req, res) => {
  try {
    const batch = await BatchCall.findOne({ id: req.params.id });
    if (!batch) return res.status(404).json({ detail: "Batch not found" });

    batch.status = "in_progress";
    batch.total_calls_dispatched = 0;
    batch.last_updated_at_unix = Math.floor(Date.now() / 1000);

    /* Reset failed recipients to pending */
    batch.recipients.forEach((r) => {
      if (r.status === "failed" || r.status === "cancelled") {
        r.status = "pending";
        r.updated_at_unix = Math.floor(Date.now() / 1000);
      }
    });

    await batch.save();
    res.json({ message: "Batch retrying", status: batch.status });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;
