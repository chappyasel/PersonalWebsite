"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect } from "react";

import { THEME_COLOR, THEME_STORAGE_KEY, oppositeTheme } from "~/lib/theme";

function getThemeCookieDomain(): string | undefined {
  const hostname = window.location.hostname;
  // For *.chappyasel.com subdomains, set cookie on .chappyasel.com
  if (hostname.endsWith(".chappyasel.com") || hostname === "chappyasel.com") {
    return ".chappyasel.com";
  }
  // For *.localhost subdomains in dev, set cookie on localhost
  if (hostname.endsWith(".localhost") || hostname === "localhost") {
    return "localhost";
  }
  return undefined;
}

function getThemeFromCookie(): string | null {
  const match = /(?:^|; )theme=([^;]*)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]!) : null;
}

function setThemeCookie(theme: string) {
  const domain = getThemeCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : "";
  document.cookie = `theme=${encodeURIComponent(theme)}; path=/${domainPart}; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function ThemeCookieSync() {
  const { theme, setTheme } = useTheme();

  // On mount, sync from cookie → next-themes if cookie has a value.
  // The pre-hydration script in the root layout already mirrored the cookie
  // into localStorage so first paint is correct; this keeps React state in
  // step for the rest of the session.
  useEffect(() => {
    const cookieTheme = getThemeFromCookie();
    if (cookieTheme && cookieTheme !== theme) {
      setTheme(cookieTheme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever theme changes, sync to cookie
  useEffect(() => {
    if (theme) {
      setThemeCookie(theme);
    }
  }, [theme]);

  return null;
}

/**
 * Keeps <meta name="theme-color"> in step with the *resolved* theme.
 *
 * Static `media="(prefers-color-scheme: …)"` meta tags are not enough on their
 * own: they follow the OS, so a visitor who has explicitly picked Light while
 * their phone is in Dark would get mismatched browser chrome. Driving a single
 * tag from resolvedTheme covers both the system and the manual-override case.
 */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content =
      resolvedTheme === "dark" ? THEME_COLOR.dark : THEME_COLOR.light;
  }, [resolvedTheme]);

  return null;
}

function ThemeKeyboardShortcut() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.metaKey &&
        e.altKey &&
        (e.key.toLowerCase() === "l" || e.code === "KeyL")
      ) {
        e.preventDefault();
        setTheme(oppositeTheme(resolvedTheme));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resolvedTheme, setTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      storageKey={THEME_STORAGE_KEY}
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      <ThemeCookieSync />
      <ThemeColorSync />
      <ThemeKeyboardShortcut />
      {children}
    </NextThemesProvider>
  );
}
