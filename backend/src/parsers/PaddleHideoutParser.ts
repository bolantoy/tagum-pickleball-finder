import { PickleHubParser } from "./PickleHubParser";

export class PaddleHideoutParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "paddle_hideout",
      displayName: "Paddle Hideout",
      slug: "paddle-hideout",
      namePattern: "Paddle Hideout",
    });
  }
}
