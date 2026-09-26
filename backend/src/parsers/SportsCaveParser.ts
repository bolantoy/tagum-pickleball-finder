import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

interface BusinessResponse {
  id: string;
  name: string;
  opening_hour: number;
  closing_hour: number;
}

interface CourtPricingRule {
  daypart: "morning" | "afternoon" | "evening";
  price_per_hour: number;
}

interface CourtResponse {
  id: string;
  name: string;
  venue_type: string;
  is_active: boolean;
  base_price_per_hour: number;
  court_pricing_rules: CourtPricingRule[];
}

interface BookingOccupancy {
  court_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
}

interface CourtBlock {
  court_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
}

export class SportsCaveParser implements IParser {
  readonly parserName = "sports_cave";
  readonly displayName = "Sports Cave";

  private readonly supabaseUrl =
    "https://kgnqchymsntvupdwjviq.supabase.co/rest/v1";

  private readonly apiKey =
    process.env.DULADULA_API_KEY ?? "";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    const sourceUrl =
      "https://book.duladula.app/venue/sports-cave";

    try {
      logger.info(
        `[${this.displayName}] Checking availability for ${date}`
      );

      if (!this.apiKey) {
        throw new Error("DULADULA_API_KEY is not configured");
      }

      const client = createHttpClient();

      const headers = {
        apikey: this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      };

      // Find the Sports Cave business.
      const businessResponse = await client.get<BusinessResponse[]>(
        `${this.supabaseUrl}/businesses_public`,
        {
          params: {
            select: "id,name,opening_hour,closing_hour",
            slug: "eq.sports-cave",
          },
          headers,
        }
      );

      const business = businessResponse.data[0];

      if (!business) {
        throw new Error("Sports Cave business was not found");
      }

      // Get all active courts and their pricing rules.
      const courtsResponse = await client.get<CourtResponse[]>(
        `${this.supabaseUrl}/courts`,
        {
          params: {
            select:
              "id,name,venue_type,is_active,base_price_per_hour,court_pricing_rules(daypart,price_per_hour)",
            business_id: `eq.${business.id}`,
            is_active: "eq.true",
            order: "name.asc",
          },
          headers,
        }
      );

      const courts = courtsResponse.data;

      // Get bookings for all Sports Cave courts for the requested date.
      const courtIds = courts.map((court) => court.id);

      const bookingsResponse = await client.get<BookingOccupancy[]>(
        `${this.supabaseUrl}/booking_occupancy`,
        {
          params: {
            select:
              "court_id,booking_date,start_time,end_time,status",
            court_id: `in.(${courtIds.join(",")})`,
            booking_date: `eq.${date}`,
          },
          headers,
        }
      );

      // Get owner-blocked periods for all Sports Cave courts.
      const blocksResponse = await client.get<CourtBlock[]>(
        `${this.supabaseUrl}/court_blocks`,
        {
          params: {
            select: "court_id,block_date,start_time,end_time",
            court_id: `in.(${courtIds.join(",")})`,
            block_date: `eq.${date}`,
          },
          headers,
        }
      );

      const bookings = bookingsResponse.data;
      const blocks = blocksResponse.data;

      const slots: ParsedSlot[] = [];

      // Sports Cave's configured operating hours are 8 AM–12 AM.
      const openingHour = business.opening_hour;
      const closingHour = business.closing_hour;

      for (let hour = openingHour; hour < closingHour; hour++) {
        const startHour = hour;
        const endHour = hour + 1;

        const start = `${String(startHour).padStart(2, "0")}:00`;
        const end = `${String(endHour % 24).padStart(2, "0")}:00`;

        const slotStart = `${start}:00`;
        const slotEnd = `${end}:00`;

        const daypart =
          hour < 12
            ? "morning"
            : hour < 17
              ? "afternoon"
              : "evening";

        for (const court of courts) {
          const bookingConflict = bookings.some((booking) => {
            if (booking.court_id !== court.id) {
              return false;
            }

            return (
              booking.start_time < slotEnd &&
              booking.end_time > slotStart
            );
          });

          const blockConflict = blocks.some((block) => {
            if (block.court_id !== court.id) {
              return false;
            }

            return (
              block.start_time < slotEnd &&
              block.end_time > slotStart
            );
          });

          const available =
            !bookingConflict && !blockConflict;

          const pricingRule = court.court_pricing_rules.find(
            (rule) => rule.daypart === daypart
          );

          const price =
            pricingRule?.price_per_hour ??
            court.base_price_per_hour;

          slots.push({
            courtId: court.id,
            court: court.name,
            startTime: start,
            endTime: end,
            available,
            status: available ? "available" : "booked",
            price: `₱${price}`,
          });
        }
      }

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
}