import { PickleHubParser } from "./PickleHubParser";

export class RallyPointParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "rally_point",
      displayName: "The Rally Point",
      slug: "the-rally-point",
      namePattern: "the%rally%point",
    });
  }
}