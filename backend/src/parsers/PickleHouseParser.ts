import { PickleHubParser } from "./PickleHubParser";

export class PickleHouseParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "pickle_house",
      displayName: "Pickle House",
      slug: "pickle-house",
      namePattern: "pickle%house",
    });
  }
}
