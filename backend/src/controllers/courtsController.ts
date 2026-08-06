// ─── Courts Controller ─────────────────────────────────────────────────────────
import { Request, Response, NextFunction } from "express";
import { getAllCourts, getCourtById } from "../services/courtsService";
import { createError } from "../middleware/errorHandler";

/**
 * GET /courts
 * Returns all active courts.
 */
export async function listCourts(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const courts = await getAllCourts();
    res.json({ success: true, data: courts });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /court/:id
 * Returns a single court by UUID.
 */
export async function getCourtDetails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      return next(createError("Court ID is required", 400));
    }

    const court = await getCourtById(id);

    if (!court) {
      return next(createError(`Court not found: ${id}`, 404));
    }

    res.json({ success: true, data: court });
  } catch (err) {
    next(err);
  }
}
