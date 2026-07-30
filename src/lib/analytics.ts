"use client";

import type { PostHog } from "posthog-js";

type AnalyticsProperties = Record<string, unknown>;

let initialization: Promise<PostHog | null> | null = null;

function initializeAnalytics() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (initialization) return initialization;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return Promise.resolve(null);

  initialization = import("posthog-js").then(({ default: posthog }) => {
    if (!posthog.__loaded) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        person_profiles: "always",
      });
    }
    return posthog;
  });

  return initialization;
}

export function capture(
  event: string,
  properties?: AnalyticsProperties,
): void {
  void initializeAnalytics().then((posthog) => {
    if (!posthog) return;
    posthog.capture(event, properties);
    window.dispatchEvent(
      new CustomEvent("chappy:analytics-captured", {
        detail: { event, properties },
      }),
    );
  });
}

export function scheduleAnalyticsInitialization(): void {
  if (typeof window === "undefined") return;

  const schedule = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => void initializeAnalytics(), {
        timeout: 3000,
      });
    } else {
      globalThis.setTimeout(() => void initializeAnalytics(), 1);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

scheduleAnalyticsInitialization();
