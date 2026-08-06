// ─── Theme Context ────────────────────────────────────────────────────────────
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../constants/colors";
import { Config } from "../constants/config";
import { AppTheme, ThemeMode } from "../types";

interface ThemeContextValue {
  theme: AppTheme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function buildTheme(isDark: boolean, mode: ThemeMode): AppTheme {
  return {
    mode,
    isDark,
    colors: isDark ? Colors.dark : Colors.light,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");

  // Load persisted theme preference
  useEffect(() => {
    AsyncStorage.getItem(Config.STORAGE_KEYS.THEME)
      .then((stored) => {
        if (stored === "dark" || stored === "light" || stored === "system") {
          setThemeModeState(stored);
        }
      })
      .catch(() => {});
  }, []);

  const isDark =
    themeMode === "system"
      ? systemColorScheme === "dark"
      : themeMode === "dark";

  const theme = buildTheme(isDark, themeMode);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(Config.STORAGE_KEYS.THEME, mode).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeMode(isDark ? "light" : "dark");
  }, [isDark, setThemeMode]);

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to consume the current app theme.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
