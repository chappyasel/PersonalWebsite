import { describe, expect, it, vi } from "vitest";

import {
  type AnalyticsEvent,
  HOMEPAGE_PORTAL_ACTIVATED_EVENT,
  createAnalyticsInterface,
  sanitizeAnalyticsProperties,
} from "./analytics";

describe("analytics interface", () => {
  it("keeps Portal activation on one legacy analytics contract", async () => {
    const deliver = vi.fn();
    const analytics = createAnalyticsInterface({
      loadTransport: async () => deliver,
    });

    analytics.capture(HOMEPAGE_PORTAL_ACTIVATED_EVENT, {
      door_id: "grab:ai-collective-mark",
      section: "about",
      destination: "external",
    });
    await analytics.start();

    expect(HOMEPAGE_PORTAL_ACTIVATED_EVENT).toBe("homepage_door_activated");
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith("homepage_door_activated", {
      door_id: "grab:ai-collective-mark",
      section: "about",
      destination: "external",
    });
  });

  it("defers transport loading and flushes queued events in order", async () => {
    const delivered: Array<{ event: AnalyticsEvent; properties: unknown }> = [];
    const loadTransport = vi.fn(async () => {
      return (event: AnalyticsEvent, properties: unknown) => {
        delivered.push({ event, properties });
      };
    });
    const analytics = createAnalyticsInterface({ loadTransport });

    analytics.capture("homepage_delivery", {
      mode: "flat",
      reason: "reduced_motion",
    });
    analytics.capture("homepage_contact_selected", { method: "linkedin" });

    expect(loadTransport).not.toHaveBeenCalled();
    expect(delivered).toEqual([]);

    await analytics.start();

    expect(delivered).toEqual([
      {
        event: "homepage_delivery",
        properties: { mode: "flat", reason: "reduced_motion" },
      },
      {
        event: "homepage_contact_selected",
        properties: { method: "linkedin" },
      },
    ]);
  });

  it("deduplicates a journey fact for one document lifecycle", async () => {
    const deliver = vi.fn();
    const analytics = createAnalyticsInterface({
      loadTransport: async () => deliver,
    });

    analytics.captureOnce(
      "homepage:section:books",
      "homepage_section_arrived",
      { section: "books", delivery_mode: "world" },
    );
    analytics.captureOnce(
      "homepage:section:books",
      "homepage_section_arrived",
      { section: "books", delivery_mode: "flat" },
    );
    await analytics.start();

    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith("homepage_section_arrived", {
      section: "books",
      delivery_mode: "world",
    });
  });

  it("starts with a fresh dedupe set for a new document interface", async () => {
    const deliver = vi.fn();
    const first = createAnalyticsInterface({
      loadTransport: async () => deliver,
    });
    const second = createAnalyticsInterface({
      loadTransport: async () => deliver,
    });

    first.captureOnce("deep-page:manual", "deep_page_entered", {
      page: "manual",
    });
    second.captureOnce("deep-page:manual", "deep_page_entered", {
      page: "manual",
    });
    await Promise.all([first.start(), second.start()]);

    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("retains a failed delivery for a later retry without throwing", async () => {
    const deliver = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("analytics unavailable");
      })
      .mockImplementation(() => undefined);
    const analytics = createAnalyticsInterface({
      loadTransport: async () => deliver,
    });

    expect(() =>
      analytics.capture("homepage_contact_selected", { method: "linkedin" }),
    ).not.toThrow();
    await expect(analytics.start()).resolves.toBeUndefined();
    expect(deliver).toHaveBeenCalledOnce();

    await expect(analytics.start()).resolves.toBeUndefined();
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenLastCalledWith("homepage_contact_selected", {
      method: "linkedin",
    });
  });

  it("retries a rejected load and delivers a once-only fact after success", async () => {
    const deliver = vi.fn();
    const loadTransport = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValueOnce(deliver);
    const analytics = createAnalyticsInterface({ loadTransport });

    analytics.captureOnce("homepage:delivery", "homepage_delivery", {
      mode: "world",
      reason: "world",
    });
    await expect(analytics.start()).resolves.toBeUndefined();
    expect(deliver).not.toHaveBeenCalled();

    analytics.captureOnce("homepage:delivery", "homepage_delivery", {
      mode: "flat",
      reason: "runtime_fallback",
    });
    await expect(analytics.start()).resolves.toBeUndefined();

    expect(loadTransport).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith("homepage_delivery", {
      mode: "world",
      reason: "world",
    });

    analytics.captureOnce("homepage:delivery", "homepage_delivery", {
      mode: "flat",
      reason: "runtime_fallback",
    });
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("bounds the queue by dropping newest events", async () => {
    const deliver = vi.fn();
    const analytics = createAnalyticsInterface({
      loadTransport: async () => deliver,
      maxQueueSize: 2,
    });

    analytics.capture("homepage_contact_selected", { method: "linkedin" });
    analytics.capture("homepage_contact_selected", { method: "github" });
    analytics.capture("homepage_contact_selected", { method: "medium" });
    await analytics.start();

    expect(deliver.mock.calls).toEqual([
      ["homepage_contact_selected", { method: "linkedin" }],
      ["homepage_contact_selected", { method: "github" }],
    ]);
  });
});

describe("analytics URL privacy", () => {
  it("removes queries and fragments from SDK URL properties at every level", () => {
    expect(
      sanitizeAnalyticsProperties({
        $current_url: "https://www.chappyasel.com/books?search=private#notes",
        $referrer: "https://example.com/path?campaign=secret",
        $set: {
          $initial_current_url: "https://www.chappyasel.com/?token=secret",
          retained: "yes",
        },
        section: "books",
      }),
    ).toEqual({
      $current_url: "https://www.chappyasel.com/books",
      $referrer: "https://example.com/path",
      $set: {
        $initial_current_url: "https://www.chappyasel.com/",
        retained: "yes",
      },
      section: "books",
    });
  });

  it("drops malformed URL properties instead of forwarding raw values", () => {
    expect(
      sanitizeAnalyticsProperties({
        $current_url: "http://[invalid",
        event_property: "kept",
      }),
    ).toEqual({ event_property: "kept" });
  });
});
