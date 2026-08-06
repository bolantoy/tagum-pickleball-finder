// ─── Global Error Handler Middleware ─────────────────────────────────────────
import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Creates an operational error (expected, non-crash error).
 */
export function createError(message: string, statusCode = 500): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}

/**
 * Express error-handling middleware.
 * Must be registered last (after all routes).
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const isDev = process.env.NODE_ENV !== "production";

  if (!err.isOperational) {
    logger.error("Unhandled error:", err);
  }

  res.status(statusCode).json({
    success: false,
    error: err.message || "Internal Server Error",
    ...(isDev && { stack: err.stack }),
  });
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}
