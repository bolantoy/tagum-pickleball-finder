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

// ── API Routes ────────────────────────────────────────────────────────────────
// All routes are prefixed with /api/v1
app.use("/api/v1", routes);

// ── 404 & Error Handlers (must be last) ──────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
