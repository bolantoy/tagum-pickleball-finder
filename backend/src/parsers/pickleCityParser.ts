import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

interface PickleCityApiSlot {
  startTime: string;
  endTime: string;
  status: string;
}

export class PickleCityParser implements IParser {
  readonly parserName = "pickle_city";
  readonly displayName = "Pickle City Tagum";

  private readonly baseUrl = process.env.PICKLE_CITY_URL || "https://picklecitytagum.com";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    const sourceUrl = `${this.baseUrl.replace(/\/+$/, "")}/api/reservations/availability?date=${encodeURIComponent(date)}`;

    try {
      logger.info(`[${this.displayName}] Checking availability for ${date}`);
      const response = await createHttpClient().get<PickleCityApiSlot[]>(sourceUrl);
      const slots = this.toParsedSlots(response.data);

      logger.info(`[${this.displayName}] Found ${slots.length} slots for ${date}`);
      return { courtId, courtName, date, slots, sourceUrl, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown parser error";
      logger.error(`[${this.displayName}] Failed: ${message}`);
      return {
        courtId,
        courtName,
        date,
        slots: [],
        sourceUrl,
        error: `Could not reach ${this.displayName}: ${message}`,
      };
    }
  }

  private toParsedSlots(apiSlots: PickleCityApiSlot[]): ParsedSlot[] {
    if (!Array.isArray(apiSlots)) return [];

    const slotsByTime = new Map<string, ParsedSlot>();

    for (const slot of apiSlots) {
      const startTime = this.extractTime(slot.startTime);
      const endTime = this.extractTime(slot.endTime);

      if (!startTime || !endTime || typeof slot.status !== "string") {
        continue;
      }

      const key = `${startTime}-${endTime}`;
      const existing = slotsByTime.get(key);
      const available = slot.status.toLowerCase() === "available";

      if (existing) {
        existing.available ||= available;
      } else {
        slotsByTime.set(key, { startTime, endTime, available, price: null });
      }
    }

    return Array.from(slotsByTime.values());
  }

  private extractTime(dateTime: string): string | null {
    if (typeof dateTime !== "string") return null;
    const match = dateTime.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : null;
  }
}
