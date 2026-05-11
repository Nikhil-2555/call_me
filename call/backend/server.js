require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
require("express-ws")(app);
/* ── Middleware ── */
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));

/* ── Routes ── */
app.use("/auth", require("./routes/auth"));
app.use("/agents", require("./routes/agents"));
app.use("/voices", require("./routes/voices"));
app.use("/phone-numbers", require("./routes/phoneNumbers"));
app.use("/call", require("./routes/calls"));
app.use("/batch-calling", require("./routes/batchCalling"));
app.use("/mcp", require("./routes/mcp"));
app.use("/api", require("./routes/generateAgent"));
app.use("/", require("./routes/dashboard"));

/* ── Health check ── */
app.get("/health", (_req, res) => res.json({ status: "ok" }));

/* ── Error handler ── */
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ detail: err.message || "Internal server error" });
});

/* ── Connect to MongoDB and start ── */
const PORT = process.env.PORT || 8000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });
