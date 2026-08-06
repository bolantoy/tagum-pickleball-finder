// ─── Server Entry Point ───────────────────────────────────────────────────────
import "dotenv/config";
import app from "./app";
import { logger } from "./utils/logger";

const PORT = parseInt(process.env.PORT || "3000", 10);

const server = app.listen(PORT, () => {
  logger.info(`🏓 Tagum Pickleball Finder API running on port ${PORT}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`   Health:      http://localhost:${PORT}/api/v1/health`);
  logger.info(`   Courts:      http://localhost:${PORT}/api/v1/courts`);
  logger.info(`   Availability: http://localhost:${PORT}/api/v1/availability`);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});

export default server;
