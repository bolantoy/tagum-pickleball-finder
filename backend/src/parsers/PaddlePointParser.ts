import { PickleHubParser } from "./PickleHubParser";

export class PaddlePointParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "paddle_point",
      displayName: "Paddle Point Tagum",
      slug: "paddle-point-tagum",
      namePattern: "paddle%point%tagum",
    });
  }
}