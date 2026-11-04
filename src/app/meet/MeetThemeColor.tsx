"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { THEME_COLOR } from "~/lib/theme";

const MEET_COLOR = { light: "#f5f5f7", dark: "#0e0e0f" };

function paint(colors: typeof MEET_COLOR, dark: boolean) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    meta.content = dark ? colors.dark : colors.light;
  }
}

/**
 * Browser chrome in /meet's page grey or near-black rather than the site's
 * sand. The site's ThemeColorSync paints after this effect (parents run
 * theirs after children), so this paints on the next frame, and gives the
 * site its colours back when the page goes.
 */
export function MeetThemeColor() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  useEffect(() => {
    if (!resolvedTheme) return;
    const frame = requestAnimationFrame(() => paint(MEET_COLOR, dark));
    return () => {
      cancelAnimationFrame(frame);
      paint(THEME_COLOR, dark);
    };
  }, [resolvedTheme, dark]);

  return null;
}
