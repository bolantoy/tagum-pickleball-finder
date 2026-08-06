// ─── Health Check Route ────────────────────────────────────────────────────────
import { Router, Request, Response } from "express";
import { HealthStatus } from "../types";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const status: HealthStatus = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  };
  res.json(status);
});

export default router;
