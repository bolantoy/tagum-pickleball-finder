import { IParser } from "../interfaces/IParser";
import { ParseResult, ParsedSlot } from "../types";

export class PaddleYardParser implements IParser {
  readonly parserName = "paddleyard";
  readonly displayName = "Paddle Yard Tagum";

  private readonly baseUrl =
    "https://paddleyardtagum.com";

  async checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult> {

    const slots: ParsedSlot[] = [];

    return {
      courtId,
      courtName,
      date,
      slots,
      sourceUrl: this.baseUrl,
      error: null,
    };
  }
}