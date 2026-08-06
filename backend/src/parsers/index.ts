// ─── Parser Registry ──────────────────────────────────────────────────────────
// All parsers are registered here. To add a new court:
//   1. Create a new file in this directory implementing IParser
//   2. Import it below and add an entry to PARSER_REGISTRY
//   3. Add the court to Supabase with the matching parser_name

import { IParser } from "../interfaces/IParser";
import { PickleballersParser } from "./pickleballersParser";
import { PickleCityParser } from "./pickleCityParser";
import { HideoutParser } from "./hideoutParser";
import { logger } from "../utils/logger";

/**
 * Registry maps parser_name → parser instance.
 * parser_name must match the `parser_name` column in the courts table.
 */
const PARSER_REGISTRY: Record<string, IParser> = {
  pickleballers: new PickleballersParser(),
  pickle_city: new PickleCityParser(),
  hideout: new HideoutParser(),
};

/**
 * Returns the parser for a given parserName, or null if not found.
 */
export function getParser(parserName: string): IParser | null {
  const parser = PARSER_REGISTRY[parserName];
  if (!parser) {
    logger.warn(`No parser registered for: "${parserName}"`);
    return null;
  }
  return parser;
}

/**
 * Returns all registered parsers.
 */
export function getAllParsers(): IParser[] {
  return Object.values(PARSER_REGISTRY);
}

/**
 * Returns all registered parser names.
 */
export function getParserNames(): string[] {
  return Object.keys(PARSER_REGISTRY);
}
