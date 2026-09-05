export const Config = {
  API_BASE_URL:
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    "https://tagum-pickleball-finder.onrender.com/api/v1",

  GOOGLE_MAPS_API_KEY:
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",

  APP_NAME: "Tagum Pickleball Finder",
  APP_VERSION: "1.0.0",
  APP_TAGLINE: "Find courts. Play more.",

  DEFAULT_REGION: {
    latitude: 7.4478,
    longitude: 125.8087,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  },

  DATE_FORMAT: "MMMM d, yyyy",

  STORAGE_KEYS: {
    FAVORITES: "@tagum_pb:favorites",
    SCHEDULE: "tagum_pb:schedule",
    THEME: "@tagum_pb:theme",
    RECENT_SEARCHES: "@tagum_pb:recent_searches",
  },

  REQUEST_TIMEOUT: 30000,
} as const;

console.log("Loaded API URL:", Config.API_BASE_URL);