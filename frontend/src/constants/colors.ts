// ─── Color System ─────────────────────────────────────────────────────────────
// Tagum Pickleball Finder — dual-mode palette (dark primary, light secondary).

export const Colors = {
  // ── Brand ──────────────────────────────────────────────────────────────────
  brand: {
    primary: "#22C55E",      // Pickleball green
    primaryLight: "#4ADE80",
    primaryDark: "#16A34A",
    accent: "#0EA5E9",       // Sky blue for accents
    accentLight: "#38BDF8",
  },

  // ── Dark Mode ──────────────────────────────────────────────────────────────
  dark: {
    background: "#0F172A",   // Slate-900 — main background
    surface: "#1E293B",      // Slate-800 — cards, modals
    surfaceHigh: "#334155",  // Slate-700 — elevated elements
    surfaceSubtle: "#172235",
    surfacePressed: "#26354B",
    border: "#475569",       // Slate-600 — borders
    text: "#F8FAFC",         // Slate-50 — primary text
    textSecondary: "#94A3B8",// Slate-400 — muted text
    textMuted: "#64748B",    // Slate-500 — very muted
    icon: "#CBD5E1",         // Slate-300 — icons
  },

  // ── Light Mode ─────────────────────────────────────────────────────────────
  light: {
    background: "#F8FAFC",   // Slate-50
    surface: "#FFFFFF",
    surfaceHigh: "#F1F5F9",  // Slate-100
    surfaceSubtle: "#F8FAFC",
    surfacePressed: "#E2E8F0",
    border: "#E2E8F0",       // Slate-200
    text: "#0F172A",         // Slate-900
    textSecondary: "#475569",// Slate-600
    textMuted: "#94A3B8",    // Slate-400
    icon: "#64748B",         // Slate-500
  },

  // ── Semantic ───────────────────────────────────────────────────────────────
  available: "#22C55E",
  unavailable: "#EF4444",
  warning: "#F59E0B",
  info: "#3B82F6",

  planned: "#F59E0B",
  booked: "#22C55E",

  // ── Utility ────────────────────────────────────────────────────────────────
  transparent: "transparent",
  white: "#FFFFFF",
  black: "#000000",
  overlay: "rgba(0, 0, 0, 0.5)",
  overlayLight: "rgba(0, 0, 0, 0.2)",
} as const;

export type ColorScheme = "dark" | "light";
