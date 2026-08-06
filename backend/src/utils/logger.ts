// ─── Winston Logger ────────────────────────────────────────────────────────────
import winston from "winston";

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}] ${stack || message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    process.env.NODE_ENV === "production"
      ? winston.format.json()
      : combine(colorize(), logFormat)
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Add http level (used by morgan stream)
logger.add(
  new winston.transports.Console({
    level: "http",
    silent: process.env.NODE_ENV === "production",
  })
);
