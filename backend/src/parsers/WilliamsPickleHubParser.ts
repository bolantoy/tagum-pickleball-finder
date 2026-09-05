import { PickleHubParser } from "./PickleHubParser";

export class WilliamsPickleHubParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "williams",
      displayName: "Williams Pickle Hub",
      slug: "williams-tagum",
      namePattern: "williams%tagum",
    });
  }
}
