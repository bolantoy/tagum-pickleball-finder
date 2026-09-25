import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";
import { createHttpClient } from "../utils/httpClient";
import { logger } from "../utils/logger";

interface BootstrapCourt {
  id: string;
  court_type: string;
  category_id: string;
  court_notes: string | null;
  court_number: number;
  lighting_available: boolean;
}

interface BootstrapAvailability {
  start_time: string;
  end_time: string;
  price_per_hour: number;
  day_of_week: string;
}

interface BootstrapCategory {
  id: string;
  name: string;
  display_order: number;
  hide_count: boolean;
  exclude_from_availability_search: boolean;
}

interface BootstrapResponse {
  courts: BootstrapCourt[];
  availability: BootstrapAvailability[];
  categories: BootstrapCategory[];
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
  courtNumbers?: number[];
  courtMapping?: Record<string, number>;
}

export class PickleHubParser implements IParser {

  readonly parserName: string;
  readonly displayName: string;

  protected readonly slug: string;
  protected readonly namePattern: string;
  protected readonly courtNumbers?: number[];
  protected readonly courtMapping?: Record<string, number>;

  protected readonly supabaseUrl =
    "https://odimuhhyzyzdymujymzy.supabase.co/rest/v1";

  protected readonly apiKey =
    process.env.PICKLEHUB_API_KEY ?? "";

  constructor(config: PickleHubConfig) {
    this.parserName = config.parserName;
    this.displayName = config.displayName;
    this.slug = config.slug;
    this.namePattern = config.namePattern;
    this.courtNumbers = config.courtNumbers;
    this.courtMapping = config.courtMapping;
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

        const categories = bootstrap.data.categories;

        const categoryFilteredCourts =
          categories.length > 0
            ? bootstrap.data.courts.filter((court) =>
                categories.some(
                  (category) =>
                    category.id === court.category_id &&
                    !category.exclude_from_availability_search
                )
              )
            : bootstrap.data.courts;

        const mappedCourtNumber = this.courtMapping?.[courtId];

        const searchableCourts = categoryFilteredCourts.filter((court) => {
          if (
            mappedCourtNumber !== undefined &&
            court.court_number !== mappedCourtNumber
          ) {
            return false;
          }

          if (
            this.courtNumbers &&
            !this.courtNumbers.includes(court.court_number)
          ) {
            return false;
          }

          return true;
        });

        const courtsChecked = searchableCourts.length;

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

        const booked = bookings.data;
        
        const weekday = new Date(date)
          .toLocaleDateString("en-US", { weekday: "long" })
          .toLowerCase();

        const todaysAvailability = bootstrap.data.availability.filter(
          (a) => a.day_of_week === weekday
        );

        const slots: ParsedSlot[] = [];

        for (const availability of todaysAvailability) {
          let hour = parseInt(
            availability.start_time.substring(0, 2),
            10
          );

          let endHour = parseInt(
            availability.end_time.substring(0, 2),
            10
          );

          // Handle schedules crossing midnight.
          if (endHour <= hour) {
            endHour += 24;
          }

          while (hour < endHour) {
            const normalizedHour = hour % 24;
            const nextHour = (hour + 1) % 24;

            const start = `${String(normalizedHour).padStart(2, "0")}:00`;
            const end = `${String(nextHour).padStart(2, "0")}:00`;

            for (const court of searchableCourts) {
              const slotStart = `${start}:00`;
              const slotEnd = `${end}:00`;

              const available = !booked.some((booking) => {
                if (booking.court_id !== court.id) {
                  return false;
                }

                return (
                  booking.start_time < slotEnd &&
                  booking.end_time > slotStart
                );
              });

              slots.push({
                courtId: court.id,
                court: `Court ${court.court_number}`,
                startTime: start,
                endTime: end,
                available,
                status: available ? "available" : "booked",
                price: `₱${availability.price_per_hour}`,
              });
            }

            hour++;
          }
        }
  
        if (slots.length > 0) {
          logger.info(`[${this.displayName}] Generated ${slots.length} slots`);
        }
  
        return {
          courtId,
          courtName,
          date,
          courtsChecked,
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
}