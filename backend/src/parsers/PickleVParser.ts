import { PickleHubParser } from "./PickleHubParser";

export class PickleVParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "picklev",
      displayName: "PickleV",
      slug: "picklev",
      namePattern: "picklev",
    });
  }
}
