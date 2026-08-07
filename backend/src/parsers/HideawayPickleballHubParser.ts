import { PickleHubParser } from "./PickleHubParser";

export class HideawayPickleballHubParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "hideaway",
      displayName: "Hideaway Pickleball Hub",
      slug: "hideaway-pickleball-hub",
      namePattern: "hideaway%pickleball%hub",
    });
  }
}