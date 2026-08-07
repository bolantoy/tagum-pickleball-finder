import { PickleHubParser } from "./PickleHubParser";

export class PaddleHourParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "paddle_hour",
      displayName: "Paddle Hour",
      slug: "paddle-hour",
      namePattern: "paddle%hour",
    });
  }
}