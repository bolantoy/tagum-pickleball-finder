import "dotenv/config";

export default {
  expo: {
    name: "Tagum Pickleball Finder",
    slug: "tagum-pickleball-finder",
    version: "1.0.0",
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/46962857-7979-4fdd-8c4d-3c2ba77e8de0",
    },
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],

    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.tagum.pickleballfinder",
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },

    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0F172A",
      },
      package: "com.tagum.pickleballfinder",
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
      ],
    },

    web: {
      favicon: "./assets/favicon.png",
    },

    plugins: [
      [
        "expo-splash-screen",
        {
          backgroundColor: "#0F172A",
          image: "./assets/splash.png",
          imageWidth: 200,
        },
      ],
      "expo-secure-store",
    ],

    extra: {
      eas: {
        projectId: "46962857-7979-4fdd-8c4d-3c2ba77e8de0",
      },
    },
  },
};
