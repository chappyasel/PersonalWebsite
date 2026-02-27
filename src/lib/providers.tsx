"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import { Observer } from "tailwindcss-intersect";

import { env } from "~/env";

if (typeof window !== "undefined") {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: "always",
  });
}
export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}

export function ObserverProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    Observer.start();
  }, []);

  return <>{children}</>;
}

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

  // On mount, sync from cookie → next-themes if cookie has a value
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

function ThemeKeyboardShortcut() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.altKey && (e.key.toLowerCase() === "l" || e.code === "KeyL")) {
        e.preventDefault();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
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
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      <ThemeCookieSync />
      <ThemeKeyboardShortcut />
      {children}
    </NextThemesProvider>
  );
}
