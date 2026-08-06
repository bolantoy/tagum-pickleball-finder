// ─── App Configuration ────────────────────────────────────────────────────────

export const Config = {
  // API base URL — set via EXPO_PUBLIC_API_BASE_URL in .env
  API_BASE_URL:
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    "http://192.168.254.106:3000/api/v1",

  GOOGLE_MAPS_API_KEY:
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",

  // App metadata
  APP_NAME: "Tagum Pickleball Finder",
  APP_VERSION: "1.0.0",
  APP_TAGLINE: "Find courts. Play more.",

  // Tagum City default map center
  DEFAULT_REGION: {
    latitude: 7.4478,
    longitude: 125.8087,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  },

  // Date format for display
  DATE_FORMAT: "MMMM d, yyyy",

  // AsyncStorage keys
  STORAGE_KEYS: {
    FAVORITES: "@tagum_pb:favorites",
    THEME: "@tagum_pb:theme",
    RECENT_SEARCHES: "@tagum_pb:recent_searches",
  },

  // Request timeout in milliseconds
  REQUEST_TIMEOUT: 30_000,
} as const;
