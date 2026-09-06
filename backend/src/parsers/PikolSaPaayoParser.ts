import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

const PIKOL_SOURCE_URL = "https://pikolsapaayo.ernebook.com/";

const FIRESTORE_URL =
  "https://firestore.googleapis.com/v1/projects/ernebook/databases/ai-studio-ernebook-a75e1d36-16dc-48c0-badd-510c9f1bf0fb/documents:runQuery";

const PIKOL_VENDOR_ID = "v-1786436438463";

const PIKOL_COURTS = [
  {
    supabaseId: "602281f8-4c60-47a3-b064-8f89ad387759",
    externalId: "c-1786517405829",
    name: "Court 1",
  },
  {
    supabaseId: "81a7aa32-1518-4f37-ac68-cd9b6a934a12",
    externalId: "c-1788608386064",
    name: "Court 2",
  },
];

const OPENING_HOUR = 5;
const CLOSING_HOUR = 24;

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
}

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}

interface FirestoreQueryResult {
  document?: FirestoreDocument;
}

interface PikolBooking {
  vendorId: string;
  courtId: string;
  date: string;
  startTime: number;
  endTime: number;
  status: string;
}

function getString(
  fields: Record<string, FirestoreValue>,
  fieldName: string
): string | null {
  const value = fields[fieldName];

  if (!value) {
    return null;
  }

  if (typeof value.stringValue === "string") {
    return value.stringValue;
  }

  if (typeof value.timestampValue === "string") {
    return value.timestampValue;
  }

  return null;
}

function getNumber(
  fields: Record<string, FirestoreValue>,
  fieldName: string
): number | null {
  const value = fields[fieldName];

  if (!value) {
    return null;
  }

  if (typeof value.integerValue === "string") {
    const parsed = Number(value.integerValue);

    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value.doubleValue === "number") {
    return Number.isFinite(value.doubleValue)
      ? value.doubleValue
      : null;
  }

  if (typeof value.stringValue === "string") {
    const parsed = Number(value.stringValue);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseTime(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    const hour = Number(trimmed);

    return hour >= 0 && hour <= 24 ? hour : null;
  }

  const match = trimmed.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i
  );

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3]?.toUpperCase();

  if (minutes !== 0) {
    return null;
  }

  if (meridiem === "AM") {
    if (hour === 12) {
      hour = 0;
    }
  } else if (meridiem === "PM") {
    if (hour !== 12) {
      hour += 12;
    }
  }

  return hour >= 0 && hour <= 24 ? hour : null;
}

function getBookingTime(
  fields: Record<string, FirestoreValue>,
  fieldName: string
): number | null {
  const numericValue = getNumber(fields, fieldName);

  if (numericValue !== null) {
    return numericValue;
  }

  return parseTime(getString(fields, fieldName));
}

function formatTime(hour: number): string {
  if (hour === 24) {
    return "00:00";
  }

  return `${String(hour).padStart(2, "0")}:00`;
}

function getPrice(hour: number): string {
  return hour >= 17 ? "\u20B1250" : "\u20B1200";
}

function overlaps(
  slotStart: number,
  slotEnd: number,
  bookingStart: number,
  bookingEnd: number
): boolean {
  return slotStart < bookingEnd && slotEnd > bookingStart;
}

function parseBookings(
  results: FirestoreQueryResult[],
  date: string
): PikolBooking[] {
  const bookings: PikolBooking[] = [];

  for (const result of results) {
    const fields = result.document?.fields;

    if (!fields) {
      continue;
    }

    const vendorId = getString(fields, "vendorId");
    const courtId = getString(fields, "courtId");
    const bookingDate = getString(fields, "date");
    const startTime = getBookingTime(fields, "startTime");
    const endTime = getBookingTime(fields, "endTime");
    const status = getString(fields, "status");

    if (
      !vendorId ||
      !courtId ||
      !bookingDate ||
      startTime === null ||
      endTime === null ||
      !status
    ) {
      continue;
    }

    if (
      vendorId !== PIKOL_VENDOR_ID ||
      bookingDate !== date ||
      status.toLowerCase() !== "confirmed"
    ) {
      continue;
    }

    bookings.push({
      vendorId,
      courtId,
      date: bookingDate,
      startTime,
      endTime,
      status,
    });
  }

  return bookings;
}

export class PikolSaPaayoParser implements IParser {
  readonly parserName = "pikol_sa_paayo";
  readonly displayName = "Pikol sa Paayo";

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

      const response = await client.post<FirestoreQueryResult[]>(
        FIRESTORE_URL,
        {
          structuredQuery: {
            from: [
              {
                collectionId: "bookings",
              },
            ],
            where: {
              compositeFilter: {
                op: "AND",
                filters: [
                  {
                    fieldFilter: {
                      field: {
                        fieldPath: "vendorId",
                      },
                      op: "EQUAL",
                      value: {
                        stringValue: PIKOL_VENDOR_ID,
                      },
                    },
                  },
                  {
                    fieldFilter: {
                      field: {
                        fieldPath: "date",
                      },
                      op: "EQUAL",
                      value: {
                        stringValue: date,
                      },
                    },
                  },
                ],
              },
            },
            orderBy: [
              {
                field: {
                  fieldPath: "__name__",
                },
                direction: "ASCENDING",
              },
            ],
          },
        }
      );

      const bookings = parseBookings(response.data, date);

      const externalCourt = PIKOL_COURTS.find(
        (court) => court.supabaseId === courtId
      );

      if (!externalCourt) {
        throw new Error(`Unknown Pikol Supabase court: ${courtId}`);
      }

      const courtBookings = bookings.filter(
        (booking) => booking.courtId === externalCourt.externalId
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
          courtId: externalCourt.externalId,
          court: externalCourt.name,
          startTime: formatTime(slotStart),
          endTime: formatTime(slotEnd),
          available: !booked,
          status: booked ? "booked" : "available",
          price: getPrice(hour),
        });
      }

      logger.info(
        `[${this.displayName}] Generated ${slots.length} slots for ${courtName}`
      );

      return {
        courtId,
        courtName,
        date,
        courtsChecked: 1,
        slots,
        sourceUrl: PIKOL_SOURCE_URL,
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
        sourceUrl: PIKOL_SOURCE_URL,
        error: message,
      };
    }
  }
}
