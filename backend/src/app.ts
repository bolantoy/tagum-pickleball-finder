// ─── Express App Setup ────────────────────────────────────────────────────────
import express, { Application } from "express";
import "dotenv/config";

import { corsMiddleware } from "./middleware/corsMiddleware";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import routes from "./routes";

const app: Application = express();

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.get("/api/v1/test-sports360", async (_req, res) => {
  try {
    const url =
      "https://app.sports360.ph/api/v2/court-bookings/public-calendar" +
      "?storehubId=c7560838-7aab-4457-9f6e-103f76a78725" +
      "&sportsDay=2026-09-26";

    const response = await fetch(url);
    const body = await response.text();

    res.status(200).json({
      sports360Status: response.status,
      sports360Ok: response.ok,
      body: body.slice(0, 1000),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ── API Routes ────────────────────────────────────────────────────────────────
// All routes are prefixed with /api/v1
app.use("/api/v1", routes);

// ── 404 & Error Handlers (must be last) ──────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
