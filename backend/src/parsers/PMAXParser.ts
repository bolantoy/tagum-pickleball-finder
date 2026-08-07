import { PickleHubParser } from "./PickleHubParser";

export class PMAXParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "pmax",
      displayName: "PMAX",
      slug: "pmax",
      namePattern: "pmax",
    });
  }
}