import { PickleHubParser } from "./PickleHubParser";

export class TheLOBParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "the_lob",
      displayName: "The LOB",
      slug: "the-lob",
      namePattern: "the%lob",
    });
  }
}