/**
 * Design tokens, shared by web (converted to CSS variables in ui-web) and
 * mobile (passed straight to RN styles). Plain values only — a `rem` or a
 * `var(--accent)` string is meaningless outside the DOM.
 */

export const palette = {
  dark: {
    bg: "#1a1a1a",
    surface: "#262626",
    surface2: "#333333",
    surfaceUser: "#2e2e2e",
    border: "#3a3a3a",
    text: "#e8e8e8",
    textMuted: "#9ca3af",
    accent: "#e8602c",
    accentHover: "#d14f20",
  },
  light: {
    bg: "#fefdfb",
    surface: "#ffffff",
    surface2: "#f0eee9",
    surfaceUser: "#ecebe6",
    border: "#e2dfd7",
    text: "#2c2a26",
    textMuted: "#6b7280",
    accent: "#dd5f2f",
    accentHover: "#c94f22",
  },
} as const;

export type Palette = (typeof palette)["dark"];

/** Base font sizes in px — consumers scale to rem or dp as they need. */
export const fontSize = {
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
} as const;

/** Spacing step in px; components use multiples of it. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Unitless line heights. */
export const lineHeight = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.7,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
} as const;
