import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

type CourtsResponse = CourtResponse[];

interface CourtResponse {
  id: number;
  name: string;
  pricePerHour: number;
  isUnderMaintenance: boolean;
  maintenanceReason: string | null;
}

type AvailabilityResponse = AvailabilityRecord[];

interface AvailabilityRecord {
  courtId: number;
  startTime: string;
  endTime: string;
  status: string;
}

export class SmashZoneParser implements IParser {
  readonly parserName = "smash_zone";
  readonly displayName = "Smash Zone";

  private readonly baseUrl =
    "https://smashzone.dinkhubs.com";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    const sourceUrl =
      "https://smashzone.dinkhubs.com/";

    try {
      logger.info(
        `[${this.displayName}] Checking availability for ${date}`
      );

      const client = createHttpClient();

      const [courtsResponse, availabilityResponse] =
        await Promise.all([
          client.get<CourtsResponse>(
            `${this.baseUrl}/api/courts`
          ),
          client.get<AvailabilityResponse>(
            `${this.baseUrl}/api/reservations/availability`,
            {
              params: {
                date,
                _t: Date.now(),
              },
            }
          ),
        ]);

      const courts = courtsResponse.data;
      const availability = availabilityResponse.data.filter((record: AvailabilityRecord) => String(record.courtId) === courtId);

      const courtMap = new Map(
        courts.map((court) => [court.id, court])
      );

      const slots = availability
        .map((record): ParsedSlot | null => {
          const court = courtMap.get(record.courtId);

          if (!court) {
            return null;
          }

          const startTime = record.startTime.slice(11, 16);
          const endTime = record.endTime.slice(11, 16);

          const status = this.mapStatus(record.status);

          return {
            courtId: String(record.courtId),
            court: court.name,
            startTime,
            endTime,
            available: status === "available",
            status,
            price: this.getPrice(date, startTime),
          };
        })
        .filter((slot): slot is ParsedSlot => slot !== null);

      logger.info(
        `[${this.displayName}] Courts returned: ${courts.length}`
      );

      logger.info(
        `[${this.displayName}] Generated ${slots.length} slots`
      );

      return {
        courtId,
        courtName,
        date,
        courtsChecked: courts.length,
        slots,
        sourceUrl,
        error: null,
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unknown parser error";

      logger.error(
        `[${this.displayName}] ${message}`
      );

      return {
        courtId,
        courtName,
        date,
        courtsChecked: 0,
        slots: [],
        sourceUrl,
        error: message,
      };
    }
  }

  private getPrice(date: string, startTime: string): string {
    const day = new Date(`${date}T00:00:00`).getDay();
    const hour = Number(startTime.slice(0, 2));

    if (day >= 1 && day <= 4) {
      return hour < 16 ? "\u20B1160" : "\u20B1290";
    }

    if (day === 5) {
      return "\u20B1160";
    }

    if (day === 6) {
      return hour >= 18 ? "\u20B1290" : "\u20B1160";
    }

    return hour < 14 ? "\u20B1250" : "\u20B1290";
  }
  private mapStatus(
    status: string
  ): ParsedSlot["status"] {
    switch (status.toLowerCase()) {
      case "available":
        return "available";

      case "openplay":
        return "openplay";

      case "awaiting":
      case "pending":
        return "awaiting";

      case "booked":
      case "blocked":
      default:
        return "booked";
    }
  }
}



