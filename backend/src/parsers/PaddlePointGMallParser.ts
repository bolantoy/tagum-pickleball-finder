import { PickleHubParser } from "./PickleHubParser";

export class PaddlePointGMallParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "paddle_point_gmall",
      displayName: "Paddle Point GMall Tagum",
      slug: "paddle-point-gmall-tagum",
      namePattern: "paddle%point%gmall%tagum",
    });
  }
}