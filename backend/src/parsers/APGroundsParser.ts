import { PickleHubParser } from "./PickleHubParser";

export class APGroundsParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "ap_grounds",
      displayName: "AP Grounds",
      slug: "ap-grounds",
      namePattern: "ap%grounds",
    });
  }
}