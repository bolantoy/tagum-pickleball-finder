// ─── Parser Interface ─────────────────────────────────────────────────────────
// Every court booking website parser must implement this interface.
// This ensures parsers are interchangeable and new courts can be added easily.

import { ParseResult } from "../types";

/**
 * A CourtParser is responsible for scraping availability data
 * from a specific court's booking website.
 */
export interface IParser {
  /**
   * Unique identifier matching the "parser_name" field in the courts table.
   */
  readonly parserName: string;

  /**
   * Human-readable name for logging and error messages.
   */
  readonly displayName: string;

  /**
   * Check availability for a specific date.
   * @param date - Date string in "YYYY-MM-DD" format
   * @param courtId - The court's UUID from Supabase
   * @param courtName - Human-readable court name
   * @returns ParseResult with slots or an error message (never throws)
   */
  checkAvailability(
    date: string,
    courtId: string,
    courtName: string
  ): Promise<ParseResult>;
}

/**
 * Factory type for creating parsers.
 */
export type ParserFactory = () => IParser;
