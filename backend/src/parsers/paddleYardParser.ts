import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

interface BookedSlot {
  court_id: number;
  time_slot: string;
}

export class PaddleYardParser implements IParser {
  readonly parserName = "paddleyard";
  readonly displayName = "Paddle Yard";

  private readonly apiUrl =
    "https://jxrdmsexmusccjmsrgre.supabase.co/rest/v1/rpc/get_booked_slots";

  private readonly apiKey =
    "REDACTED-PADDLEYARD-KEY";

  private readonly OPEN_SLOTS = [
    "6 AM - 7 AM",
    "7 AM - 8 AM",
    "8 AM - 9 AM",
    "9 AM - 10 AM",
    "3 PM - 4 PM",
    "4 PM - 5 PM",
    "5 PM - 6 PM",
    "6 PM - 7 PM",
    "7 PM - 8 PM",
    "8 PM - 9 PM",
    "9 PM - 10 PM",
  ];

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    const sourceUrl = this.apiUrl;

    try {
      logger.info(`[${this.displayName}] Checking availability for ${date}`);

      const client = createHttpClient();

      const response = await client.post<BookedSlot[]>(
        this.apiUrl,
        {
          p_date: date,
        },
        {
          headers: {
            apikey: this.apiKey,
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const booked = response.data;

      const slots: ParsedSlot[] = [];

      for (const court of [1, 2]) {
        for (const slot of this.OPEN_SLOTS) {
          const isBooked = booked.some(
            (b) => b.court_id === court && b.time_slot === slot
          );

          const [startLabel, endLabel] = slot.split(" - ");

          const startTime = this.convertTo24Hour(startLabel);
          const endTime = this.convertTo24Hour(endLabel);

          slots.push({
            courtId: String(court),
            courtName: `Outdoor Court ${court}`,
            startTime,
            endTime,
            available: !isBooked,
            price: startTime < "16:00" ? "₱200" : "₱250",
          });
        }
      }

      if (slots.length > 0) {
        logger.info(
          `[${this.displayName}] Generated ${slots.length} slots`
        );
      }

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
      const message =
        err instanceof Error ? err.message : "Unknown parser error";

      logger.error(`[${this.displayName}] ${message}`);

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

  private convertTo24Hour(time: string): string {
    const [hourString, period] = time.split(" ");

    let hour = parseInt(hourString, 10);

    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;

    return `${String(hour).padStart(2, "0")}:00`;
  }
}