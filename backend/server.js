require("dotenv").config();
const express = require("express");
const cors = require("cors");
const expressWs = require("express-ws");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// CRITICAL: apply express-ws BEFORE routes — patches Router prototype for router.ws()
expressWs(app);

/* ── Middleware ── */
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));  // Twilio sends form-encoded webhooks

/* ── Routes ── */
app.use("/auth",          require("./routes/auth"));
app.use("/agents",        require("./routes/agents"));
app.use("/voices",        require("./routes/voices"));
app.use("/phone-numbers", require("./routes/phoneNumbers"));
app.use("/call",          require("./routes/calls"));
app.use("/batch-calling", require("./routes/batchCalling"));
app.use("/mcp",           require("./routes/mcp"));
app.use("/api",           require("./routes/generateAgent"));
app.use("/",              require("./routes/dashboard"));

/* ── Health check ── */
app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

/* ── Global error handler ── */
app.use(errorHandler);

const { startBatchWorker } = require("./services/batchWorker");

/* ── Start ── */
const PORT = process.env.PORT || 8000;
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      startBatchWorker();
    });
  })
  .catch((err) => {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  });

// ── Auto-detect ngrok public URL ──
// If ngrok is running, override PUBLIC_URL so Twilio can always reach us.
async function detectNgrokUrl() {
  try {
    const res = await fetch("http://127.0.0.1:4040/api/tunnels");
    if (!res.ok) return;
    const data = await res.json();
    const httpsTunnel = data.tunnels?.find(t => t.proto === "https");
    if (httpsTunnel?.public_url) {
      process.env.PUBLIC_URL = httpsTunnel.public_url;
      console.log(`🌐 Auto-detected ngrok URL: ${httpsTunnel.public_url}`);
    }
  } catch {
    // ngrok not running — fall through to PUBLIC_URL from .env
  }
}
detectNgrokUrl();

