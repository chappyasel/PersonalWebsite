"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}
