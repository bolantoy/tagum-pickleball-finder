import { PickleHubParser } from "./PickleHubParser";

export class BigJPaddleGroundsApokonParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "bigj_apokon",
      displayName: "Big J Paddle Grounds Apokon",
      slug: "big-j-paddle-grounds-apokon",
      namePattern: "big%j%paddle%grounds%apokon",
    });
  }
}