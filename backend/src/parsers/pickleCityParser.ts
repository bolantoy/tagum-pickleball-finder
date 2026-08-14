import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

interface PickleCityApiSlot {
  courtId: string | number;
  startTime: string;
  endTime: string;
  status: string;
}

export class PickleCityParser implements IParser {
  readonly parserName = "pickle_city";
  readonly displayName = "Pickle City Tagum";

  private readonly baseUrl =
    process.env.PICKLE_CITY_URL ||
    "https://picklecitytagum.com";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    const sourceUrl =
      `${this.baseUrl.replace(/\/+$/, "")}` +
      `/api/reservations/availability?date=${encodeURIComponent(date)}`;

    try {
      logger.info(
        `[${this.displayName}] Checking availability for ${date}`
      );

      const response =
        await createHttpClient().get<PickleCityApiSlot[]>(
          sourceUrl
        );

      const slots = this.toParsedSlots(
        response.data,
        courtId,
        courtName
      );

      const uniqueCourtIds = new Set(
        slots.map((slot) => slot.courtId)
      );

      logger.info(
        `[${this.displayName}] Found ${slots.length} slots ` +
        `across ${uniqueCourtIds.size} courts for ${date}`
      );

      return {
        courtId,
        courtName,
        date,
        courtsChecked: uniqueCourtIds.size,
        slots,
        sourceUrl,
        error: null,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown parser error";

      logger.error(
        `[${this.displayName}] Failed: ${message}`
      );

      return {
        courtId,
        courtName,
        date,
        courtsChecked: 0,
        slots: [],
        sourceUrl,
        error:
          `Could not reach ${this.displayName}: ${message}`,
      };
    }
  }

  private toParsedSlots(
    apiSlots: PickleCityApiSlot[],
    courtId: string,
    courtName: string
  ): ParsedSlot[] {
    if (!Array.isArray(apiSlots)) {
      return [];
    }

    return apiSlots.flatMap((slot) => {
      const startTime = this.extractTime(slot.startTime);
      const endTime = this.extractTime(slot.endTime);

      if (
        slot.courtId === undefined ||
        slot.courtId === null ||
        !startTime ||
        !endTime ||
        typeof slot.status !== "string"
      ) {
        return [];
      }

      const physicalCourtId = String(slot.courtId);

      const available =
        slot.status.toLowerCase() === "available";

      return [
        {
          courtId: physicalCourtId,
          court: `Court ${physicalCourtId}`,
          startTime,
          endTime,
          available,
          status: available ? "available" : "booked",
          price: null,
        },
      ];
    });
  }

  private extractTime(
    dateTime: string
  ): string | null {
    if (typeof dateTime !== "string") {
      return null;
    }

    const match = dateTime.match(/T(\d{2}:\d{2})/);

    return match ? match[1] : null;
  }
}