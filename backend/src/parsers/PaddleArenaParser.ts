import { PickleHubParser } from "./PickleHubParser";

export class PaddleArenaParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "paddle_arena",
      displayName: "Paddle Arena",
      slug: "paddle-arena",
      namePattern: "Paddle Arena",
    });
  }
}
