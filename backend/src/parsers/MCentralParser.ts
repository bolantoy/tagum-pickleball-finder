import { PickleHubParser } from "./PickleHubParser";

export class MCentralParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "m_central",
      displayName: "M Central Pickleball Club",
      slug: "m-central-pickleball-club",
      namePattern: "m%central%pickleball%club",
    });
  }
}