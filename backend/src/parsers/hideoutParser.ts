import { IParser } from "../interfaces/IParser";
import { ParseResult } from "../types";
import { logger } from "../utils/logger";

export class HideoutParser implements IParser {
  readonly parserName = "hideout";
  readonly displayName = "The Hideout";

  private readonly baseUrl = process.env.HIDEOUT_URL || "https://hideouttagum.club";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {
    logger.warn(`[${this.displayName}] Booking system unavailable`);

    return {
      courtId,
      courtName,
      date,
      slots: [],
      sourceUrl: this.baseUrl,
      error: "Booking system unavailable",
    };
  }
}
