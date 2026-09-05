import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

const KUDOS_BASE_URL = "https://kudoscourts.ph";

const HAPPY_PADDLE_COURT_ID =
  "b7c5b230-82f7-44a4-a62b-a7252ba2cf57";

const HAPPY_PADDLE_SOURCE_URL =
  "https://kudoscourts.ph/venues/happy-paddle-2";

interface KudosOption {
  startTime: string;
  endTime: string;
  totalPriceCents: number;
  currency: string;
  courtId: string;
  courtLabel: string;
  status: string;
  unavailableReason: string | null;
}

interface KudosResponseItem {
  result: {
    data: {
      options: KudosOption[];
      diagnostics?: {
        hasHoursWindows: boolean;
        hasRateRules: boolean;
        dayHasHours: boolean;
        allSlotsBooked: boolean;
        reservationsDisabled: boolean;
      };
    };
  };
}

function toManilaDateTime(iso: string): {
  date: string;
  time: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export class HappyPaddleParser implements IParser {
  readonly parserName = "happy_paddle";
  readonly displayName = "Happy Paddle";

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

      // The KudosCourts API expects the requested Philippine
      // calendar day converted into UTC boundaries.
      const startDate = new Date(
        `${date}T00:00:00+08:00`
      ).toISOString();

      const endDate = new Date(
        `${date}T23:59:59.999+08:00`
      ).toISOString();

      const input = {
        "0": {
          courtId: HAPPY_PADDLE_COURT_ID,
          startDate,
          endDate,
          durationMinutes: 60,
          includeUnavailable: true,
          selectedAddons: [],
        },
      };

      const url =
        `${KUDOS_BASE_URL}/api/trpc/availability.getForCourtRange`;

      const response = await client.get<KudosResponseItem[]>(url, {
        params: {
          batch: 1,
          input: JSON.stringify(input),
        },
      });

      const data = response.data?.[0]?.result?.data;

      if (!data) {
        throw new Error(
          "Invalid KudosCourts availability response"
        );
      }

      const slots: ParsedSlot[] = [];

      for (const option of data.options ?? []) {
        const start = toManilaDateTime(option.startTime);
        const end = toManilaDateTime(option.endTime);

        // Only include slots belonging to the requested
        // Philippine calendar date.
        if (start.date !== date) {
          continue;
        }

        const available = option.status === "AVAILABLE";

        slots.push({
          courtId: HAPPY_PADDLE_COURT_ID,
          court: option.courtLabel,
          startTime: start.time,
          endTime: end.time,
          available,
          status: available ? "available" : "booked",
          price: `₱${option.totalPriceCents / 100}`,
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
        sourceUrl: HAPPY_PADDLE_SOURCE_URL,
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
        sourceUrl: HAPPY_PADDLE_SOURCE_URL,
        error: message,
      };
    }
  }
}
