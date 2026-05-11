const router = require("express").Router();
const Conversation = require("../models/Conversation");
const Agent = require("../models/Agent");

/* GET /dashboard/stats — summary statistics */
router.get("/dashboard/stats", async (_req, res) => {
  try {
    const [totalAgents, totalConversations, totalPhoneNumbers] = await Promise.all([
      Agent.countDocuments(),
      Conversation.countDocuments(),
      require("../models/PhoneNumber").countDocuments(),
    ]);

    const conversations = await Conversation.find().lean();
    const successful = conversations.filter((c) => c.evaluation === "Successful").length;
    const failed = conversations.filter((c) => c.evaluation === "Failed").length;
    const totalCredits = conversations.reduce((sum, c) => sum + (c.creditsCall || 0), 0);
    const totalCost = conversations.reduce((sum, c) => sum + (c.totalUSD || 0), 0);

    res.json({
      totalAgents,
      totalConversations,
      totalPhoneNumbers,
      successfulCalls: successful,
      failedCalls: failed,
      totalCreditsUsed: totalCredits,
      totalCostUSD: parseFloat(totalCost.toFixed(4)),
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* GET /conversations — list conversations (call history) */
router.get("/conversations", async (req, res) => {
  try {
    const conversations = await Conversation.find()
      .sort({ date: -1 })
      .lean();
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;
