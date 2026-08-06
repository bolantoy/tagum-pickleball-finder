// ─── Request Logger Middleware ────────────────────────────────────────────────
import morgan from "morgan";
import { logger } from "../utils/logger";

// Create a stream that writes to Winston
const stream = {
  write: (message: string) => logger.http(message.trim()),
};

// Use "dev" format in development, "combined" in production
export const requestLogger = morgan(
  process.env.NODE_ENV === "production" ? "combined" : "dev",
  { stream }
);
