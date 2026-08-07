import { PickleHubParser } from "./PickleHubParser";

export class BigJPaddleGroundsMankilamParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "bigj_mankilam",
      displayName: "Big J Paddlegrounds Mankilam",
      slug: "big-j-paddlegrounds-mankilam",
      namePattern: "big%j%paddlegrounds%mankilam",
    });
  }
}