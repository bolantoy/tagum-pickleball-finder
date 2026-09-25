import { PickleHubParser } from "./PickleHubParser";

export class ThePinkleZoneParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "the_pinkle_zone",
      displayName: "The Pinkle Zone",
      slug: "the-pinkle-zone",
      namePattern: "The Pinkle Zone",
    });
  }
}
