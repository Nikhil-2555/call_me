/**
 * middleware/errorHandler.js
 * Global Express error handler
 */
function errorHandler(err, _req, res, _next) {
  console.error("❌ Unhandled error:", err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ detail: err.message || "Internal server error" });
}

module.exports = errorHandler;
