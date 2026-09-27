// ─── Request Logger Middleware ────────────────────────────────────────────────
import morgan from "morgan";
import type { Request } from "express";
import { logger } from "../utils/logger";

// Create a stream that writes to Winston
const stream = {
  write: (message: string) => logger.http(message.trim()),
};

// Use "dev" format in development, "combined" in production
// Never log query strings or request headers: both may accidentally contain
// organizer/player credentials. Keep only the path and standard response data.
morgan.token("safe-url", (req) => {
  const url = (req as Request).originalUrl ?? req.url ?? "";
  return url.split("?")[0] ?? "";
});

export function createRequestLogger(outputStream: { write: (message: string) => void } = stream) {
  return morgan(":method :safe-url :status :res[content-length] - :response-time ms", { stream: outputStream });
}

export const requestLogger = createRequestLogger();
