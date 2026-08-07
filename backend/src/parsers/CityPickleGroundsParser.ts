import { PickleHubParser } from "./PickleHubParser";

export class CityPickleGroundsParser extends PickleHubParser {
  constructor() {
    super({
      parserName: "city_pickle_grounds",
      displayName: "City Pickle Grounds",
      slug: "city-pickle-grounds",
      namePattern: "city%pickle%grounds",
    });
  }
}