import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sceneQualityStorageBucket } from "./quality";
import type { SceneQualityAxes } from "./qualityAxes";
import {
  clearLearnedQuality,
  learningAvailable,
  readLearnedQuality,
  writeLearnedQuality,
} from "./qualityLearning";

const axes: SceneQualityAxes = {
  resolutionStep: 7,
  effects: "lean",
  content: "reduced",
};

const bucket = () =>
  sceneQualityStorageBucket({
    capability: "standard",
    cssWidth: 393,
    cssHeight: 852,
    deviceDpr: 3,
  });

/** An in-memory Storage, so these tests never depend on the environment
 * actually providing one. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

function installStorage(storage: Storage | (() => never)) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value:
      typeof storage === "function"
        ? {
            get localStorage(): Storage {
              return storage();
            },
          }
        : { localStorage: storage },
  });
}

describe("cross-visit quality learning", () => {
  beforeEach(() => installStorage(memoryStorage()));
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    vi.restoreAllMocks();
  });

  it("survives a round trip through storage", () => {
    writeLearnedQuality(bucket(), axes, "efficient");
    expect(readLearnedQuality(bucket())).toEqual({
      resolutionStep: 7,
      effects: "lean",
      content: "reduced",
      profile: "efficient",
    });
  });

  it("stores the axis triple rather than only a profile name", () => {
    writeLearnedQuality(bucket(), axes, "efficient");
    const restored = readLearnedQuality(bucket())!;
    expect(restored.resolutionStep).toBe(axes.resolutionStep);
    expect(restored.effects).toBe(axes.effects);
    expect(restored.content).toBe(axes.content);
  });

  it("keys the entry by the versioned bucket", () => {
    expect(bucket()).toContain("stacks-quality:v5:");
  });

  it("ignores an entry written under the previous format version", () => {
    // v4 wrote a bare profile name under a v4 key. Neither the key nor the
    // shape can be read now, which is the intended invalidation.
    const v4Key = bucket().replace(":v5:", ":v4:");
    window.localStorage.setItem(v4Key, "safety");
    expect(readLearnedQuality(bucket())).toBeNull();
  });

  it("ignores a v4-shaped bare profile name found under the current key", () => {
    window.localStorage.setItem(bucket(), "safety");
    expect(readLearnedQuality(bucket())).toBeNull();
  });

  it("rejects an entry with an unrecognised tier", () => {
    window.localStorage.setItem(
      bucket(),
      JSON.stringify({ resolutionStep: 5, effects: "ludicrous", content: "full" }),
    );
    expect(readLearnedQuality(bucket())).toBeNull();
  });

  it("rejects an entry with a non-numeric resolution step", () => {
    window.localStorage.setItem(
      bucket(),
      JSON.stringify({ resolutionStep: "high", effects: "lean", content: "full" }),
    );
    expect(readLearnedQuality(bucket())).toBeNull();
  });

  it("clamps a stored step that sits outside the ladder", () => {
    window.localStorage.setItem(
      bucket(),
      JSON.stringify({ resolutionStep: 99, effects: "lean", content: "full" }),
    );
    expect(readLearnedQuality(bucket())!.resolutionStep).toBe(11);
  });

  it("overwrites rather than accumulating", () => {
    writeLearnedQuality(bucket(), axes, "efficient");
    writeLearnedQuality(
      bucket(),
      { resolutionStep: 11, effects: "full", content: "full" },
      "showcase",
    );
    expect(readLearnedQuality(bucket())!.resolutionStep).toBe(11);
    expect(window.localStorage.length).toBe(1);
  });

  it("clears an entry on request", () => {
    writeLearnedQuality(bucket(), axes, "efficient");
    clearLearnedQuality(bucket());
    expect(readLearnedQuality(bucket())).toBeNull();
  });

  it("returns null for a bucket that was never written", () => {
    expect(readLearnedQuality(bucket())).toBeNull();
  });
});

describe("when persistent storage is unavailable", () => {
  const throwing = () => {
    throw new Error("SecurityError: storage is disabled");
  };

  beforeEach(() => installStorage(throwing));
  afterEach(() => Reflect.deleteProperty(globalThis, "window"));

  it("reports learning as unavailable", () => {
    expect(learningAvailable()).toBe(false);
  });

  it("degrades to disabled rather than throwing on read", () => {
    expect(() => readLearnedQuality(bucket())).not.toThrow();
    expect(readLearnedQuality(bucket())).toBeNull();
  });

  it("degrades to disabled rather than throwing on write", () => {
    expect(() => writeLearnedQuality(bucket(), axes, "efficient")).not.toThrow();
  });

  it("degrades to disabled rather than throwing on clear", () => {
    expect(() => clearLearnedQuality(bucket())).not.toThrow();
  });
});

describe("when storage exists but refuses to write", () => {
  beforeEach(() => {
    const storage = memoryStorage();
    installStorage({
      ...storage,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    } as Storage);
  });
  afterEach(() => Reflect.deleteProperty(globalThis, "window"));

  it("treats a quota failure as learning being off", () => {
    // The probe write fails, so the store is reported unavailable rather than
    // half-working. Learning is an optimisation, not a feature.
    expect(learningAvailable()).toBe(false);
    expect(() => writeLearnedQuality(bucket(), axes, "safety")).not.toThrow();
  });
});
