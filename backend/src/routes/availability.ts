// ─── Availability Routes ───────────────────────────────────────────────────────
import { Router } from "express";
import { getAvailability } from "../controllers/availabilityController";

const router = Router();

/**
 * GET /availability?date=YYYY-MM-DD
 * Scrapes all registered booking sites and returns merged availability data.
 */
router.get("/", getAvailability);

export default router;
