import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

const GROUND_ZERO_BASE_URL = "https://groundzerotagum.dulaco.net";

const GROUND_ZERO_SOURCE_URL = "https://groundzerotagum.dulaco.net/";

const GROUND_ZERO_COURT_ID =
  "1bf46aa9-7e1c-45b3-8eb2-6d115e1ba218";

const GROUND_ZERO_COURT_NAME = "Court 1";

const OPENING_HOUR = 10;
const CLOSING_HOUR = 24;

interface GroundZeroBooking {
  courtId: string;
  bookingDate: string;
  startTime: number;
  endTime: number;
  status: string;
}

interface GroundZeroBookingsResponse {
  bookings: GroundZeroBooking[];
}

function formatTime(hour: number): string {
  if (hour === 24) {
    return "00:00";
  }

  return `${String(hour).padStart(2, "0")}:00`;
}

function getPrice(hour: number): string {
  return hour >= 17 ? "₱300" : "₱225";
}

function overlaps(
  slotStart: number,
  slotEnd: number,
  bookingStart: number,
  bookingEnd: number
): boolean {
  return slotStart < bookingEnd && slotEnd > bookingStart;
}

export class GroundZeroParser implements IParser {
  readonly parserName = "ground_zero";
  readonly displayName = "Ground Zero Pickleball";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    try {
      logger.info(
        `[${this.displayName}] Checking availability for ${date}`
      );

      const client = createHttpClient();

      const url = `${GROUND_ZERO_BASE_URL}/api/bookings`;

      const response =
        await client.get<GroundZeroBookingsResponse>(url, {
          params: {
            date,
          },
        });

      const bookings = response.data?.bookings;

      if (!Array.isArray(bookings)) {
        throw new Error(
          "Invalid Ground Zero bookings response"
        );
      }

      const courtBookings = bookings.filter(
        (booking) =>
          booking.courtId === GROUND_ZERO_COURT_ID &&
          booking.bookingDate === date &&
          booking.status === "CONFIRMED"
      );

      const slots: ParsedSlot[] = [];

      for (
        let hour = OPENING_HOUR;
        hour < CLOSING_HOUR;
        hour++
      ) {
        const slotStart = hour;
        const slotEnd = hour + 1;

        const booked = courtBookings.some((booking) =>
          overlaps(
            slotStart,
            slotEnd,
            booking.startTime,
            booking.endTime
          )
        );

        slots.push({
          courtId: GROUND_ZERO_COURT_ID,
          court: GROUND_ZERO_COURT_NAME,
          startTime: formatTime(slotStart),
          endTime: formatTime(slotEnd),
          available: !booked,
          status: booked ? "booked" : "available",
          price: getPrice(hour),
        });
      }

      logger.info(
        `[${this.displayName}] Generated ${slots.length} slots`
      );

      return {
        courtId,
        courtName,
        date,
        courtsChecked: 1,
        slots,
        sourceUrl: GROUND_ZERO_SOURCE_URL,
        error: null,
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unknown parser error";

      logger.error(`[${this.displayName}] ${message}`);

      return {
        courtId,
        courtName,
        date,
        courtsChecked: 0,
        slots: [],
        sourceUrl: GROUND_ZERO_SOURCE_URL,
        error: message,
      };
    }
  }
}
