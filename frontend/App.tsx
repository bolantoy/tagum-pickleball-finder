// ─── App Root ─────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "./src/context/ThemeContext";
import { FavoritesProvider } from "./src/context/FavoritesContext";
import { ScheduleProvider } from "./src/context/ScheduleContext";
import AppNavigator from "./src/navigation/AppNavigator";

SplashScreen.setOptions({
  duration: 600,
  fade: true,
});

// Keep the splash screen visible while loading fonts / async work
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Add any async initialization here (fonts, etc.)
      } catch (e) {
        console.warn("App initialization error:", e);
      } finally {
        setAppReady(true);
      }
    }
    
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appReady) {
      await SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) return null;

  return (
    <GestureHandlerRootView
      style={{ flex: 1 }}
      onLayout={onLayoutRootView}
    >
      <SafeAreaProvider>
        <ThemeProvider>
          <FavoritesProvider>
            <ScheduleProvider>
              <AppNavigator />
            </ScheduleProvider>
          </FavoritesProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
