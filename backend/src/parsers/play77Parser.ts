import { PickleHubParser } from "./PickleHubParser";

export class Play77Parser extends PickleHubParser {

  constructor() {
    super({
      parserName: "play77",
      displayName: "Play 77",
      slug: "play-77-sports-court",
      namePattern: "play%77%sports%court",
    });
  }

}