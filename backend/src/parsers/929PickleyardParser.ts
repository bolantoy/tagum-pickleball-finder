import { PickleHubParser } from "./PickleHubParser";

export class NineTwoNinePickleyardParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "nine_two_nine_pickleyard",
      displayName: "929 PICKLEYARD",
      slug: "929-pickleyard",
      namePattern: "929%pickleyard",
      courtNumbers: [1, 2],
    });
  }
}
