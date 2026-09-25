import { PickleHubParser } from "./PickleHubParser";

export class PikolSaPaayoParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "pikol_sa_paayo",
      displayName: "Pikol sa Paayo",
      slug: "pikol-sa-paayo",
      namePattern: "Pikol sa Paayo",
    });
  }
}
