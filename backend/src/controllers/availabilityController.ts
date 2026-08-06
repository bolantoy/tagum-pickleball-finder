// ─── Availability Controller ───────────────────────────────────────────────────
import { Request, Response, NextFunction } from "express";
import {
  checkAllAvailability,
  groupAvailabilityByTime,
} from "../services/availabilityService";
import { createError } from "../middleware/errorHandler";
import { isValidDateString, todayString } from "../utils/dateUtils";

/**
 * GET /availability?date=YYYY-MM-DD
 * Checks all registered court websites and returns merged availability.
 * Falls back to today if no date is provided.
 */
export async function getAvailability(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam || todayString();

    if (!isValidDateString(date)) {
      return next(
        createError(
          `Invalid date format: "${date}". Use YYYY-MM-DD (e.g. 2024-03-15)`,
          400
        )
      );
    }

    const availabilityResponse = await checkAllAvailability(date);
    const grouped = groupAvailabilityByTime(availabilityResponse);

    res.json({
      success: true,
      data: {
        ...availabilityResponse,
        grouped,
      },
    });
  } catch (err) {
    next(err);
  }
}
