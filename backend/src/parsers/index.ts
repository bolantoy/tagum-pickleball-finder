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
import { Play77Parser } from "./play77Parser";
import { PaddleYardParser } from "./paddleYardParser";
import { APGroundsParser } from "./APGroundsParser";
import { PaddleHourParser } from "./PaddleHourParser";
import { CityPickleGroundsParser } from "./CityPickleGroundsParser";
import { BigJPaddleGroundsApokonParser } from "./BigJPaddleGroundsApokonParser";
import { HideawayPickleballHubParser } from "./HideawayPickleballHubParser";
import { PaddlePointParser } from "./PaddlePointParser";
import { RallyPointParser } from "./RallyPointParser";
import { MCentralParser } from "./MCentralParser";
import { PMAXParser } from "./PMAXParser";
import { PicklezoneParser } from "./PicklezoneParser";
import { BigJPaddleGroundsMankilamParser } from "./BigJPaddleGroundsMankilamParser";
import { TheLOBParser } from "./TheLOBParser";
import { SamsPickleballCourtParser } from "./SamsPickleballCourtParser";
import { PickleHouseParser } from "./PickleHouseParser";
import { NineTwoNinePickleyardParser } from "./929PickleyardParser";
import { WilliamsPickleHubParser } from "./WilliamsPickleHubParser";
import { DinkAvenueParser } from "./DinkAvenueParser";
import { HappyPaddleParser } from "./HappyPaddleParser";
import { GroundZeroParser } from "./GroundZeroParser";

/**
 * Registry maps parser_name → parser instance.
 * parser_name must match the `parser_name` column in the courts table.
 */
const PARSER_REGISTRY: Record<string, IParser> = {
  pickleballers: new PickleballersParser(),
  pickle_city: new PickleCityParser(),
  hideout: new HideoutParser(),
  play77: new Play77Parser(),
  paddleyard: new PaddleYardParser(),
  ap_grounds: new APGroundsParser(),
  paddle_hour: new PaddleHourParser(),
  city_pickle_grounds: new CityPickleGroundsParser(),
  bigj_apokon: new BigJPaddleGroundsApokonParser(),
  hideaway: new HideawayPickleballHubParser(),
  paddle_point: new PaddlePointParser(),
  rally_point: new RallyPointParser(),
  m_central: new MCentralParser(),
  pmax: new PMAXParser(),
  picklezone: new PicklezoneParser(),
  bigj_mankilam: new BigJPaddleGroundsMankilamParser(),
  the_lob: new TheLOBParser(),
  sams: new SamsPickleballCourtParser(),
  pickle_house: new PickleHouseParser(),
  nine_two_nine_pickleyard: new NineTwoNinePickleyardParser(),
  williams: new WilliamsPickleHubParser(),
  dink_avenue: new DinkAvenueParser(),
  happy_paddle: new HappyPaddleParser(),
  ground_zero: new GroundZeroParser(),
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
