import { PickleHubParser } from "./PickleHubParser";

export class PicklezoneParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "picklezone",
      displayName: "Picklezone Tagum",
      slug: "picklezone-tagum",
      namePattern: "picklezone%tagum",
    });
  }
}