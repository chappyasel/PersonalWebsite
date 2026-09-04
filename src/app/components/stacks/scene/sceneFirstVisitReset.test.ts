import { describe, expect, it } from "vitest";

import {
  clearSceneFirstVisitStorage,
  sceneFirstVisitUrl,
} from "./sceneFirstVisitReset";

function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    entries: () => Object.fromEntries(values),
  };
}

describe("first-visit scene reset", () => {
  it("clears all scene-owned storage without touching site preferences", () => {
    const local = memoryStorage({
      "stacks-quality:v6:integrated:medium": "old",
      "stacks-quality:v7:integrated:medium": "current",
      "stacks-quality:survival:v1:medium": '{"survivalUntil":1}',
      "stacks-scene-sound-muted:v1": "true",
      "stacks-warm": '{"t":1}',
      theme: "dark",
      "font-preference": "sans",
      unrelated: "keep",
    });
    const session = memoryStorage({
      "stacks.arrivals.v1": '["0"]',
      "stacks-webgl-v1": "1",
      "stacks:details-hidden": "1",
      unrelated: "keep",
    });

    clearSceneFirstVisitStorage(local, session);

    expect(local.entries()).toEqual({
      theme: "dark",
      "font-preference": "sans",
      unrelated: "keep",
    });
    expect(session.entries()).toEqual({ unrelated: "keep" });
  });

  it("removes scene overrides while preserving unrelated URL state", () => {
    const href =
      "https://example.com/?utm_source=test&debug=1&quality=cinematic&og-capture=1&grassDeformation=off#books";

    expect(sceneFirstVisitUrl(href)).toBe(
      "https://example.com/?utm_source=test#books",
    );
    expect(
      sceneFirstVisitUrl("https://example.com/?perf-profile=floor&hud=1"),
    ).toBe("https://example.com/");
  });

  it("does not let blocked storage prevent the other store from resetting", () => {
    const blocked = {
      get length(): number {
        throw new Error("blocked");
      },
      key: () => null,
      removeItem: () => undefined,
    };
    const session = memoryStorage({ "stacks-webgl-v1": "1" });

    clearSceneFirstVisitStorage(blocked, session);

    expect(session.entries()).toEqual({});
  });
});
