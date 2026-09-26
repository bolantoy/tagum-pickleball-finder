import { PickleHubParser } from "./PickleHubParser";

export class PickleVillageParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "pickle_village",
      displayName: "Pickle Village",
      slug: "pickle-village",
      namePattern: "Pickle Village",
    });
  }
}
