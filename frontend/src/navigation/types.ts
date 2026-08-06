// ─── Navigation Types ─────────────────────────────────────────────────────────
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";

// ── Root Stack ─────────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Splash: undefined;
  Main: undefined;
  CourtDetails: { courtId: string };
  Availability: { date: string; courtId?: string };
};

// ── Bottom Tab ─────────────────────────────────────────────────────────────────
export type TabParamList = {
  Home: undefined;
  Search: { date?: string } | undefined;
  Favorites: undefined;
  Settings: undefined;
};

// ── Screen Props helpers ───────────────────────────────────────────────────────
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
