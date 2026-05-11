const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const McpServer = require("../models/McpServer");

/* GET /mcp/ — list MCP servers (summary) */
router.get("/", async (_req, res) => {
  try {
    const servers = await McpServer.find().lean();
    const mcp_servers_summary = servers.map((s) => ({
      id: s.id,
      name: s.config.name,
      url: s.config.url,
      approval_policy: s.config.approval_policy,
      created_at: s.metadata.created_at,
      is_creator: s.access_info.is_creator,
      dependent_agents_count: s.dependent_agents?.length || 0,
    }));
    res.json({ mcp_servers_summary });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* POST /mcp/servers — create MCP server */
router.post("/servers", async (req, res) => {
  try {
    const { config } = req.body;

    if (!config?.name || !config?.url) {
      return res.status(400).json({ detail: "Config with name and url is required" });
    }

    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    const server = await McpServer.create({
      id,
      config: {
        url: config.url,
        name: config.name,
        approval_policy: config.approval_policy || "require_approval_all",
        transport: config.transport || "SSE",
        description: config.description || "",
        request_headers: config.request_headers || {},
        secret_token: config.secret_token || null,
        tool_approval_hashes: config.tool_approval_hashes || [],
      },
      metadata: { created_at: now, owner_user_id: "user_default" },
      access_info: { is_creator: true, creator_email: "callify@gmail.com", role: "owner" },
      dependent_agents: [],
      tools: [],
    });

    res.status(201).json({ id: server.id });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* GET /mcp/servers/:id — get server details */
router.get("/servers/:id", async (req, res) => {
  try {
    const server = await McpServer.findOne({ id: req.params.id }).lean();
    if (!server) return res.status(404).json({ detail: "Server not found" });

    res.json({
      id: server.id,
      config: server.config,
      metadata: server.metadata,
      access_info: server.access_info,
      dependent_agents: server.dependent_agents,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* DELETE /mcp/servers/:id — delete server */
router.delete("/servers/:id", async (req, res) => {
  try {
    const result = await McpServer.findOneAndDelete({ id: req.params.id });
    if (!result) return res.status(404).json({ detail: "Server not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* POST /mcp/servers/:id/test — test connection (simulated) */
router.post("/servers/:id/test", async (req, res) => {
  try {
    const server = await McpServer.findOne({ id: req.params.id }).lean();
    if (!server) return res.status(404).json({ detail: "Server not found" });

    res.json({
      status: "connected",
      latency_ms: Math.floor(Math.random() * 200) + 50,
      message: "Connection successful",
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* GET /mcp/servers/:id/tools — list server tools */
router.get("/servers/:id/tools", async (req, res) => {
  try {
    const server = await McpServer.findOne({ id: req.params.id }).lean();
    if (!server) return res.status(404).json({ detail: "Server not found" });

    res.json({ tools: server.tools || [] });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

/* PATCH /mcp/servers/:id/policy — update approval policy */
router.patch("/servers/:id/policy", async (req, res) => {
  try {
    const { approval_policy } = req.body;
    if (!approval_policy) {
      return res.status(400).json({ detail: "approval_policy is required" });
    }

    const server = await McpServer.findOneAndUpdate(
      { id: req.params.id },
      { $set: { "config.approval_policy": approval_policy } },
      { new: true, lean: true }
    );

    if (!server) return res.status(404).json({ detail: "Server not found" });

    res.json({
      id: server.id,
      config: server.config,
      metadata: server.metadata,
      access_info: server.access_info,
      dependent_agents: server.dependent_agents,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;
