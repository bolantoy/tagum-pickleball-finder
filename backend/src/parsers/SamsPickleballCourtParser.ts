import { PickleHubParser } from "./PickleHubParser";

export class SamsPickleballCourtParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "sams",
      displayName: "Sam's Pickleball Court",
      slug: "sam's-pickleball-court",
      namePattern: "sam%pickleball%court",
    });
  }
}
