// ─── Health Service ────────────────────────────────────────────────────────────
// Checks the health of the application and its dependencies.

import { supabase } from "../database/supabase";
import { logger } from "../utils/logger";

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  checks: {
    database: "ok" | "error";
    parsers: "ok";
  };
  timestamp: string;
  uptime: number;
  environment: string;
}

/**
 * Performs a lightweight health check on all critical services.
 */
export async function getHealthReport(): Promise<HealthReport> {
  const checks: HealthReport["checks"] = {
    database: "ok",
    parsers: "ok",
  };

  // Quick DB ping
  try {
    const { error } = await supabase.from("courts").select("id").limit(1);
    if (error) {
      logger.warn("Health check DB ping failed:", error.message);
      checks.database = "error";
    }
  } catch {
    checks.database = "error";
  }

  const hasErrors = Object.values(checks).some((v) => v === "error");

  return {
    status: hasErrors ? "degraded" : "ok",
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  };
}
