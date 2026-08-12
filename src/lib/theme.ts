/**
 * Shared theme vocabulary for the toggle, the keyboard shortcut, and the
 * pre-hydration script in the root layout.
 */

export const THEME_ORDER = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_ORDER)[number];

export const THEME_LABEL: Record<ThemeChoice, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * Must track `--background` in globals.css. Drives <meta name="theme-color">,
 * which is what tints the browser chrome (Safari's address bar, Android's
 * status bar) on mobile — without it the chrome stays light in dark mode and
 * the page looks like it never switched.
 */
export const THEME_COLOR = {
  light: "#fafaf9", // hsl(60 9% 98%)
  dark: "#110f0e", // hsl(24 10% 6%)
} as const;

/** localStorage key used by next-themes; also mirrored to a cookie. */
export const THEME_STORAGE_KEY = "theme";

export function normalizeTheme(value: string | undefined | null): ThemeChoice {
  return THEME_ORDER.includes(value as ThemeChoice)
    ? (value as ThemeChoice)
    : "system";
}

/**
 * Return the opposite of the theme the visitor can currently see.
 *
 * This intentionally accepts the resolved theme rather than the saved theme:
 * when the saved preference is "system", a click should still produce an
 * immediate visual change instead of first cycling to the same-looking mode.
 */
export function oppositeTheme(
  resolvedTheme: string | undefined | null,
): Exclude<ThemeChoice, "system"> {
  return resolvedTheme === "dark" ? "light" : "dark";
}
