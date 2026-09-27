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

app.get("/api/v1/test-smashzone", async (_req, res) => {
  try {
    const url =
      "https://smashzone.dinkhubs.com/api/reservations/availability" +
      "?date=2026-09-27&_t=1790472628703";

    const response = await fetch(url);
    const body = await response.text();

    res.status(200).json({
      smashZoneStatus: response.status,
      smashZoneOk: response.ok,
      body: body.slice(0, 2000),
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
