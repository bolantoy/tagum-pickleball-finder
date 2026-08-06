// ─── Availability Service ──────────────────────────────────────────────────────
// Orchestrates parallel scraping of all court booking websites.

import {
  AvailabilityResponse,
  CourtAvailability,
  GroupedAvailability,
  ParseResult,
  TimeSlot,
} from "../types";
import { getParser } from "../parsers";
import { getParsableCourts } from "./courtsService";
import { logger } from "../utils/logger";
import { formatSlotLabel } from "../utils/dateUtils";

/**
 * Checks availability across all parsable courts for a given date.
 * Parsers run in parallel; individual failures are captured, not thrown.
 */
export async function checkAllAvailability(
  date: string
): Promise<AvailabilityResponse> {
  const courts = await getParsableCourts();

  if (courts.length === 0) {
    logger.warn("No parsable courts found in database");
    return {
      date,
      results: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  logger.info(
    `Checking availability for ${courts.length} courts on ${date}`
  );

  // Run all parsers in parallel — never crash on individual failure
  const parsePromises = courts.map(async (court): Promise<CourtAvailability> => {
    const parserName = court.parser_name;

    if (!parserName) {
      return {
        courtId: court.id,
        courtName: court.name,
        date,
        slots: [],
        sourceUrl: court.website,
        lastChecked: new Date().toISOString(),
        error: "No parser configured for this court",
      };
    }

    const parser = getParser(parserName);

    if (!parser) {
      return {
        courtId: court.id,
        courtName: court.name,
        date,
        slots: [],
        sourceUrl: court.website,
        lastChecked: new Date().toISOString(),
        error: `Parser "${parserName}" is not registered`,
      };
    }

    // Parse — guaranteed to never throw (parsers handle their own errors)
    const result: ParseResult = await parser.checkAvailability(
      date,
      court.id,
      court.name
    );

    // Convert ParsedSlot → TimeSlot (add label)
    const timeSlots: TimeSlot[] = result.slots.map((slot) => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: formatSlotLabel(slot.startTime, slot.endTime),
      available: slot.available,
      price: slot.price,
    }));

    return {
      courtId: court.id,
      courtName: court.name,
      date,
      slots: timeSlots,
      sourceUrl: result.sourceUrl,
      lastChecked: new Date().toISOString(),
      error: result.error,
    };
  });

  const results = await Promise.all(parsePromises);

  logger.info(
    `Availability check complete. ${results.filter((r) => !r.error).length}/${results.length} courts succeeded.`
  );

  return {
    date,
    results,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Groups availability results by time slot for the Search screen display.
 * Returns slots in chronological order with the courts available at each time.
 */
export function groupAvailabilityByTime(
  response: AvailabilityResponse
): GroupedAvailability[] {
  const timeMap = new Map<
    string,
    { courtId: string; courtName: string; available: boolean; price: string | null }[]
  >();

  for (const courtAvail of response.results) {
    if (courtAvail.error) continue;

    for (const slot of courtAvail.slots) {
      const key = slot.label; // "8:00 AM – 9:00 AM"
      if (!timeMap.has(key)) {
        timeMap.set(key, []);
      }
      timeMap.get(key)!.push({
        courtId: courtAvail.courtId,
        courtName: courtAvail.courtName,
        available: slot.available,
        price: slot.price,
      });
    }
  }

  // Sort by start time
  const sorted = Array.from(timeMap.entries()).sort(([a], [b]) => {
    const parseTime = (label: string) => {
      const match = label.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)/);
      if (!match) return 0;
      let h = parseInt(match[1], 10);
      const ampm = match[3];
      if (ampm === "PM" && h !== 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      return h * 60 + parseInt(match[2], 10);
    };
    return parseTime(a) - parseTime(b);
  });

  return sorted.map(([time, courts]) => ({ time, courts }));
}
