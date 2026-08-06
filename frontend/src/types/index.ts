// ─── Frontend Types ────────────────────────────────────────────────────────────
// Re-export shared types + add frontend-specific types.

export type {
  Court,
  TimeSlot,
  CourtAvailability,
  AvailabilityResponse,
  GroupedAvailability,
  ApiError,
  ApiResponse,
} from "../../../shared/types";

// ── Frontend-only types ────────────────────────────────────────────────────────

export interface FavoriteCourt {
  id: string;
  name: string;
  address: string;
  savedAt: string; // ISO timestamp
}

export type ThemeMode = "dark" | "light" | "system";

export interface AppTheme {
  mode: ThemeMode;
  isDark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceHigh: string;
    border: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    icon: string;
  };
}

export interface SearchState {
  date: string;
  isLoading: boolean;
  hasSearched: boolean;
  error: string | null;
}
