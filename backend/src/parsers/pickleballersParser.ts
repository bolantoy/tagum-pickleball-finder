import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

interface PickleballersApiSlot {
  hour: number;
  rate: number;
  status: string;
}

interface PickleballersAvailabilityResponse {
  slots: PickleballersApiSlot[];
}

export class PickleballersParser implements IParser {
  readonly parserName = "pickleballers";
  readonly displayName = "Pickleballers Space";

  private readonly availabilityUrl =
    process.env.PICKLEBALLERS_URL ||
    "https://pickleballers.space/api/availability";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    const sourceUrl = `${this.availabilityUrl.replace(/\/+$/, "")}/${encodeURIComponent(date)}`;

    try {
      logger.info(`[${this.displayName}] Checking availability for ${date}`);
      const response = await createHttpClient().get<PickleballersAvailabilityResponse>(
        sourceUrl
      );
      const slots = this.toParsedSlots(response.data.slots);

      logger.info(`[${this.displayName}] Found ${slots.length} slots for ${date}`);
      return {
        courtId,
        courtName,
        date,
        courtsChecked: 1,
        slots,
        sourceUrl,
        error: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown parser error";
      logger.error(`[${this.displayName}] Failed: ${message}`);
      return {
        courtId,
        courtName,
        date,
        courtsChecked: 0,
        slots: [],
        sourceUrl,
        error: `Could not reach ${this.displayName}: ${message}`,
      };
    }
  }

  private toParsedSlots(apiSlots: PickleballersApiSlot[]): ParsedSlot[] {
    if (!Array.isArray(apiSlots)) return [];

    return apiSlots.flatMap((slot) => {
      if (
        !Number.isInteger(slot.hour) ||
        slot.hour < 0 ||
        slot.hour > 23 ||
        typeof slot.status !== "string" ||
        !Number.isFinite(slot.rate)
      ) {
        return [];
      }

      return [{
        startTime: `${String(slot.hour).padStart(2, "0")}:00`,
        endTime: `${String((slot.hour + 1) % 24).padStart(2, "0")}:00`,
        available: slot.status.toLowerCase() === "available",
        price: `₱${slot.rate}`,
      }];
    });
  }
}
