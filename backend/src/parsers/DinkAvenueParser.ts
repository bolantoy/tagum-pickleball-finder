import { PickleHubParser } from "./PickleHubParser";

export class DinkAvenueParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "dink_avenue",
      displayName: "Dink Avenue",
      slug: "dink-avenue",
      namePattern: "dink%avenue",
    });
  }
}
