"use client";

import type { PostHog } from "posthog-js";

export type HomepageDeliveryMode = "world" | "flat";
export type HomepageDeliveryReason =
  | "world"
  | "reduced_motion"
  | "save_data"
  | "webgl_unavailable"
  | "runtime_fallback";
export type HomepageBootOutcome =
  | "ready"
  | "render_error"
  | "context_lost"
  | "timeout";
export type HomepageBootPath = "cold" | "warm";
export type HomepageSection =
  | "about"
  | "books"
  | "training"
  | "systems"
  | "projects"
  | "blog"
  | "talks";
export type HomepagePortalDestination =
  | "books"
  | "weightlifting"
  | "liarsdice"
  | "manual"
  | "routine"
  | "blog"
  | "external";
export type ContactMethod =
  | "linkedin"
  | "x"
  | "instagram"
  | "github"
  | "medium";
export type DeepPage =
  | "books"
  | "weightlifting"
  | "manual"
  | "routine"
  | "liars_dice"
  | "golf";
export type UniversalSearchProvider =
  | "public-content"
  | "server"
  | "books"
  | "weightlifting"
  | "dad";
export type UniversalSearchProviderOutcome = "success" | "error" | "aborted";
export type UniversalSearchGroup =
  | "destinations"
  | "books"
  | "public-writing"
  | "weightlifting"
  | "dad"
  | "actions";
export type UniversalSearchResultKind = "destination" | "content" | "action";
export type UniversalSearchMatchKind =
  | "exact"
  | "prefix"
  | "token-prefix"
  | "substring"
  | "alias"
  | "metadata"
  | "body";

/**
 * Historical PostHog contract. Portal activations keep the original event and
 * property names so existing funnels continue without a dual-write transition
 * that would count one activation twice.
 */
export const HOMEPAGE_PORTAL_ACTIVATED_EVENT =
  "homepage_door_activated" as const;

/** The complete first-party event contract. Add events here before capture. */
export type AnalyticsEventProperties = {
  homepage_delivery: {
    mode: HomepageDeliveryMode;
    reason: HomepageDeliveryReason;
  };
  homepage_world_boot: {
    outcome: HomepageBootOutcome;
    duration_ms: number;
    boot_path: HomepageBootPath;
  };
  homepage_world_runtime_fallback: {
    mode: "flat";
    reason: "runtime_fallback";
    cause: Exclude<HomepageBootOutcome, "ready">;
    duration_ms: number;
  };
  homepage_section_arrived: {
    section: HomepageSection;
    delivery_mode: HomepageDeliveryMode;
  };
  homepage_vision_ride_entered: Record<string, never>;
  homepage_vision_ride_exited: {
    dwell_ms: number;
    exit_method: "button" | "escape" | "disabled" | "error";
  };
  homepage_vision_ride_load_failed: {
    stage: "chunk" | "model" | "shader" | "audio-controller";
  };
  [HOMEPAGE_PORTAL_ACTIVATED_EVENT]: {
    door_id: string;
    section: HomepageSection;
    destination: HomepagePortalDestination;
  };
  homepage_contact_selected: {
    method: ContactMethod;
  };
  deep_page_entered: {
    page: DeepPage;
  };
  book_viewed: {
    book_id: string;
    book_title: string;
    author: string;
    rating: number | null;
    tags: string[];
  };
  book_notion_opened: {
    book_id: string;
    book_title: string;
  };
  book_audible_opened: {
    book_id: string;
    book_title: string;
  };
  book_link_copied: {
    book_id: string;
    book_title: string;
  };
  book_tag_opened: {
    book_id: string;
    book_title: string;
    tag: string;
  };
  universal_search_opened: {
    source: "keyboard";
  };
  universal_search_provider_settled: {
    provider: UniversalSearchProvider;
    duration_ms: number;
    result_count: number;
    outcome: UniversalSearchProviderOutcome;
  };
  universal_search_zero_results: {
    eligible_provider_count: number;
  };
  universal_search_result_selected: {
    group: UniversalSearchGroup;
    kind: UniversalSearchResultKind;
    rank: number;
    match_kind: UniversalSearchMatchKind;
  };
};

export function universalSearchOpenedProperties(): AnalyticsEventProperties["universal_search_opened"] {
  return { source: "keyboard" };
}

export function universalSearchProviderSettledProperties(input: {
  provider: UniversalSearchProvider;
  durationMs: number;
  resultCount: number;
  outcome: UniversalSearchProviderOutcome;
}): AnalyticsEventProperties["universal_search_provider_settled"] {
  return {
    provider: input.provider,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    result_count: Math.max(0, Math.floor(input.resultCount)),
    outcome: input.outcome,
  };
}

export function universalSearchZeroResultsProperties(
  eligibleProviderCount: number,
): AnalyticsEventProperties["universal_search_zero_results"] {
  return {
    eligible_provider_count: Math.max(0, Math.floor(eligibleProviderCount)),
  };
}

export function universalSearchResultSelectedProperties(input: {
  group: UniversalSearchGroup;
  kind: UniversalSearchResultKind;
  rank: number;
  matchKind: UniversalSearchMatchKind;
}): AnalyticsEventProperties["universal_search_result_selected"] {
  return {
    group: input.group,
    kind: input.kind,
    rank: Math.max(0, Math.floor(input.rank)),
    match_kind: input.matchKind,
  };
}

export type AnalyticsEvent = keyof AnalyticsEventProperties;
export type AnalyticsCapture = <Event extends AnalyticsEvent>(
  event: Event,
  properties: AnalyticsEventProperties[Event],
) => void;
export type AnalyticsCaptureOnce = <Event extends AnalyticsEvent>(
  dedupeKey: string,
  event: Event,
  properties: AnalyticsEventProperties[Event],
) => void;

type AnalyticsDelivery = <Event extends AnalyticsEvent>(
  event: Event,
  properties: AnalyticsEventProperties[Event],
) => void;

type AnalyticsTransportLoader = () => Promise<AnalyticsDelivery | null>;
type AnalyticsRetryScheduler = (
  retry: () => void,
  failedAttempt: number,
) => boolean;

type QueuedAnalyticsEvent = {
  dedupeKey?: string;
  deliver: (transport: AnalyticsDelivery) => void;
};

export const ANALYTICS_QUEUE_LIMIT = 100;

/**
 * Creates one document-lifecycle interface. The production singleton lives for
 * the life of the loaded JavaScript document; tests can make isolated clients.
 */
export function createAnalyticsInterface({
  loadTransport,
  maxQueueSize = ANALYTICS_QUEUE_LIMIT,
  scheduleRetry,
}: {
  loadTransport: AnalyticsTransportLoader;
  maxQueueSize?: number;
  scheduleRetry?: AnalyticsRetryScheduler;
}): {
  capture: AnalyticsCapture;
  captureOnce: AnalyticsCaptureOnce;
  start: () => Promise<void>;
} {
  const queue: QueuedAnalyticsEvent[] = [];
  const queuedKeys = new Set<string>();
  const deliveredKeys = new Set<string>();
  const queueLimit = Math.max(0, Math.floor(maxQueueSize));
  let transport: AnalyticsDelivery | null = null;
  let loading: Promise<void> | null = null;
  let started = false;
  let disabled = false;
  let retryScheduled = false;
  let failedAttempts = 0;

  const requestRetry = (start: () => Promise<void>) => {
    failedAttempts += 1;
    if (!scheduleRetry || retryScheduled) return;
    try {
      retryScheduled = scheduleRetry(() => {
        retryScheduled = false;
        void start();
      }, failedAttempts);
    } catch {
      retryScheduled = false;
    }
  };

  const flush = (start: () => Promise<void>) => {
    if (!transport) return;

    while (queue.length > 0) {
      const queued = queue[0]!;
      try {
        queued.deliver(transport);
      } catch {
        // Retain the failed event at the head so a later attempt preserves FIFO.
        requestRetry(start);
        return;
      }

      queue.shift();
      failedAttempts = 0;
      if (queued.dedupeKey) {
        queuedKeys.delete(queued.dedupeKey);
        deliveredKeys.add(queued.dedupeKey);
      }
    }
  };

  const start = (): Promise<void> => {
    started = true;
    if (disabled) return Promise.resolve();
    if (transport) {
      flush(start);
      return Promise.resolve();
    }
    if (loading) return loading;

    const attempt = Promise.resolve()
      .then(loadTransport)
      .then((loadedTransport) => {
        if (!loadedTransport) {
          disabled = true;
          queue.length = 0;
          queuedKeys.clear();
          return;
        }
        transport = loadedTransport;
        failedAttempts = 0;
        flush(start);
      })
      .catch(() => {
        // Import/init failures are recoverable. Keep the queue for a retry.
        requestRetry(start);
      })
      .finally(() => {
        if (loading === attempt) loading = null;
      });
    loading = attempt;
    return attempt;
  };

  const enqueue = <Event extends AnalyticsEvent>(
    event: Event,
    properties: AnalyticsEventProperties[Event],
    dedupeKey?: string,
  ) => {
    // Preserve the earliest funnel chronology when the bounded queue is full.
    if (disabled || queue.length >= queueLimit) return;
    if (dedupeKey) queuedKeys.add(dedupeKey);
    queue.push({
      dedupeKey,
      deliver: (loadedTransport) => loadedTransport(event, properties),
    });

    if (!started) return;
    if (transport) flush(start);
    else if (!loading && !retryScheduled) void start();
  };

  const safeCapture: AnalyticsCapture = (event, properties) => {
    try {
      enqueue(event, properties);
    } catch {
      // Measurement must never block the action being measured.
    }
  };

  const safeCaptureOnce: AnalyticsCaptureOnce = (
    dedupeKey,
    event,
    properties,
  ) => {
    if (queuedKeys.has(dedupeKey) || deliveredKeys.has(dedupeKey)) return;
    try {
      enqueue(event, properties, dedupeKey);
    } catch {
      // Measurement must never block the action being measured.
    }
  };

  return { capture: safeCapture, captureOnce: safeCaptureOnce, start };
}

const URL_PROPERTIES = new Set([
  "$current_url",
  "$referrer",
  "$initial_current_url",
  "$initial_referrer",
]);

function querylessUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const base =
      typeof window === "undefined" ? "https://invalid.local" : window.origin;
    const url = new URL(value, base);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

/** Strip queries and fragments from URL properties added by the SDK itself. */
export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (URL_PROPERTIES.has(key)) {
      const url = querylessUrl(value);
      if (url) sanitized[key] = url;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeAnalyticsProperties(
        value as Record<string, unknown>,
      );
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

let initialization: Promise<PostHog | null> | null = null;

function initializeAnalytics(): Promise<PostHog | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (initialization) return initialization;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return Promise.resolve(null);

  initialization = import("posthog-js")
    .then(({ default: posthog }) => {
      if (!posthog.__loaded) {
        posthog.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          person_profiles: "identified_only",
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_dead_clicks: false,
          capture_heatmaps: false,
          capture_performance: false,
          disable_session_recording: true,
          rageclick: false,
          sanitize_properties: sanitizeAnalyticsProperties,
        });
      }
      return posthog;
    })
    .catch((error: unknown) => {
      initialization = null;
      if (process.env.NODE_ENV === "development") {
        console.error(
          "[analytics] initialization failed; queued events will retry:",
          error,
        );
      }
      throw error;
    });

  return initialization;
}

const ANALYTICS_RETRY_DELAYS_MS = [1000, 5000, 30000] as const;

const analytics = createAnalyticsInterface({
  loadTransport: async () => {
    const posthog = await initializeAnalytics();
    if (!posthog) return null;
    return (event, properties) => {
      posthog.capture(event, properties);
      try {
        window.dispatchEvent(
          new CustomEvent("chappy:analytics-captured", {
            detail: { event, properties },
          }),
        );
      } catch {
        // Test hooks and other local listeners are optional.
      }
    };
  },
  scheduleRetry: (retry, failedAttempt) => {
    const delay = ANALYTICS_RETRY_DELAYS_MS[failedAttempt - 1];
    if (delay === undefined) return false;
    globalThis.setTimeout(retry, delay);
    return true;
  },
});

export const capture = analytics.capture;
export const captureOnce = analytics.captureOnce;

export function scheduleAnalyticsInitialization(): void {
  if (typeof window === "undefined") return;

  const schedule = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => void analytics.start(), {
        timeout: 3000,
      });
    } else {
      globalThis.setTimeout(() => void analytics.start(), 1);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

scheduleAnalyticsInitialization();
