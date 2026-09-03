// ─── Shared Design System ────────────────────────────────────────────────────
// Global visual tokens used across Tagum Pickleball Finder.
//
// Keep these values centralized so all screens feel like one cohesive app.

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

export const BorderWidth = {
  thin: 1,
  medium: 2,
} as const;

export const Typography = {
  screenTitle: 40,
  sectionTitle: 28,
  cardTitle: 22,
  bodyLarge: 18,
  body: 16,
  bodySmall: 14,
  caption: 12,
  button: 18,
  buttonLarge: 20,
  badge: 14,
} as const;

export const FontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  heavy: "800",
} as const;

export const ComponentSize = {
  iconButton: 56,
  buttonHeight: 56,
  buttonHeightLarge: 64,
  inputHeight: 56,
  dateCardWidth: 132,
  bottomNavHeight: 82,
} as const;

export const Opacity = {
  disabled: 0.5,
  muted: 0.7,
  subtle: 0.85,
} as const;