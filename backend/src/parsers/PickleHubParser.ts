import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

interface BootstrapCourt {
  id: string;
  court_number: number;
}

interface BootstrapAvailability {
  start_time: string;
  end_time: string;
  price_per_hour: number;
  day_of_week: string;
}

interface BootstrapResponse {
  courts: BootstrapCourt[];
  availability: BootstrapAvailability[];
  profile: {
    id: string;
  };
}

interface BookingResponse {
  court_id: string;
  start_time: string;
  end_time: string;
}

interface PickleHubConfig {
  parserName: string;
  displayName: string;
  slug: string;
  namePattern: string;
}

export class PickleHubParser implements IParser {

  readonly parserName: string;
  readonly displayName: string;

  protected readonly slug: string;
  protected readonly namePattern: string;

  protected readonly supabaseUrl =
    "https://odimuhhyzyzdymujymzy.supabase.co/rest/v1";

  protected readonly apiKey =
    "REDACTED-PICKLEHUB-KEY";

  constructor(config: PickleHubConfig) {
    this.parserName = config.parserName;
    this.displayName = config.displayName;
    this.slug = config.slug;
    this.namePattern = config.namePattern;
  }

  async checkAvailability(
      date: string,
      courtId: string,
      courtName: string
    ): Promise<ParseResult> {
  
      const sourceUrl = `${this.supabaseUrl}/rpc/get_club_booking_bootstrap`;
  
      try {
        logger.info(`[${this.displayName}] Checking availability for ${date}`);
  
        const client = createHttpClient();
  
        const bootstrap = await client.post<BootstrapResponse>(
          sourceUrl,
          {
            p_slug: this.slug,
            p_name_pattern: this.namePattern,
          },
          {
            headers: {
              apikey: this.apiKey,
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );
  
        const clubId = bootstrap.data.profile.id;
  
        logger.info(
          `[${this.displayName}] Courts returned: ${bootstrap.data.courts.length}`
        );
  
        const bookingsUrl = `${this.supabaseUrl}/bookings_availability`;
  
        const bookings = await client.get<BookingResponse[]>(
          bookingsUrl,
          {
            params: {
              select: "court_id,start_time,end_time",
              club_id: `eq.${clubId}`,
              booking_date: `eq.${date}`,
              status: "in.(confirmed,pending_payment)",
              is_credit_refunded: "neq.true",
            },
            headers: {
              apikey: this.apiKey,
              Authorization: `Bearer ${this.apiKey}`,
            },
          }
        );
  
        const booked = new Set(
          bookings.data.map(
            b => `${b.court_id}-${b.start_time}-${b.end_time}`
          )
        );
        
        const weekday = new Date(date)
          .toLocaleDateString("en-US", { weekday: "long" })
          .toLowerCase();
  
        const todaysAvailability = bootstrap.data.availability.filter(
          a => a.day_of_week === weekday
        );
  
        const slots: ParsedSlot[] = [];
  
        for (const availability of todaysAvailability) {
  
          let hour = parseInt(availability.start_time.substring(0, 2), 10);
  
          let endHour = parseInt(availability.end_time.substring(0, 2), 10);
  
          // midnight comes back as 00:00
          if (endHour === 0) {
            endHour = 24;
          }
  
          while (hour < endHour) {
  
            const start = `${String(hour).padStart(2, "0")}:00`;
            const end = `${String((hour + 1) % 24).padStart(2, "0")}:00`;
  
            for (const court of bootstrap.data.courts) {
  
              const available = !booked.has(
                `${court.id}-${start}:00-${end}:00`
              );
  
              slots.push({
                courtId: court.id,
                courtName: `Court ${court.court_number}`,
  
                startTime: start,
                endTime: end,
  
                available,
  
                price: `₱${availability.price_per_hour}`,
              });
  
            }
  
            hour++;
  
          }
  
        }
  
        logger.info(`[${this.displayName}] Generated ${slots.length} slots`);
  
        return {
          courtId,
          courtName,
          date,
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
          slots: [],
          sourceUrl,
          error: message,
        };
      }
    } 
}