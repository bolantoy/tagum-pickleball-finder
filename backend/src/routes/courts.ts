// ─── Courts Routes ─────────────────────────────────────────────────────────────
import { Router } from "express";
import { listCourts, getCourtDetails } from "../controllers/courtsController";

const router = Router();

/**
 * GET /courts
 * Returns all active courts from Supabase.
 */
router.get("/", listCourts);

/**
 * GET /court/:id
 * Returns details for a single court.
 */
router.get("/:id", getCourtDetails);

export default router;
