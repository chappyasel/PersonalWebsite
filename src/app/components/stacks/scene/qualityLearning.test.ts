import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sceneQualityStorageBucket } from "./quality";
import type { SceneQualityAxes } from "./qualityAxes";
import {
  SURVIVAL_LEARNING_TTL_MS,
  clearLearnedQuality,
  learningAvailable,
  readLearnedQuality,
  readLearnedSurvivalUntil,
  writeLearnedQuality,
} from "./qualityLearning";

const axes: SceneQualityAxes = {
  resolutionStep: 7,
  effects: "lean",
  content: "reduced",
  survival: false,
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
      survival: false,
      survivalUntil: null,
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

  it("leases survival across a near-term revisit without pinning it forever", () => {
    const writtenAt = 1_000_000;
    writeLearnedQuality(bucket(), { ...axes, survival: true }, null, writtenAt);

    expect(readLearnedQuality(bucket(), writtenAt + 1)?.survival).toBe(true);
    expect(
      readLearnedQuality(bucket(), writtenAt + SURVIVAL_LEARNING_TTL_MS)
        ?.survival,
    ).toBe(false);
  });

  it("preserves a restored survival deadline instead of renewing it", () => {
    const writtenAt = 1_000_000;
    const originalUntil = writeLearnedQuality(
      bucket(),
      { ...axes, survival: true },
      null,
      writtenAt,
    );
    const rewrittenUntil = writeLearnedQuality(
      bucket(),
      { ...axes, survival: true },
      null,
      writtenAt + 10_000,
      originalUntil,
    );

    expect(rewrittenUntil).toBe(originalUntil);
    expect(readLearnedQuality(bucket(), originalUntil!)?.survival).toBe(false);
  });

  it("exposes an active survival lease before renderer capability is known", () => {
    const writtenAt = 1_000_000;
    const until = writeLearnedQuality(
      bucket(),
      { ...axes, survival: true },
      null,
      writtenAt,
    );
    const unknownCapabilityBucket = bucket().replace(":standard:", ":unknown:");

    expect(
      readLearnedSurvivalUntil(unknownCapabilityBucket, writtenAt + 1),
    ).toBe(until);
    expect(
      readLearnedSurvivalUntil(unknownCapabilityBucket, until!),
    ).toBeNull();
  });

  it("clears the opening survival lease with the learned quality", () => {
    writeLearnedQuality(bucket(), { ...axes, survival: true }, null, 1_000_000);
    clearLearnedQuality(bucket());
    expect(readLearnedSurvivalUntil(bucket(), 1_000_001)).toBeNull();
  });

  it("keys the entry by the versioned bucket", () => {
    expect(bucket()).toContain("stacks-quality:v10:");
  });

  it("ignores an entry written under the previous format version", () => {
    // v9 could persist a resolution floor learned while Safari's median
    // cadence stayed unchanged across ineffective inferred-GPU cuts.
    const v9Key = bucket().replace(":v10:", ":v9:");
    window.localStorage.setItem(
      v9Key,
      JSON.stringify({
        resolutionStep: 2,
        effects: "lean",
        content: "reduced",
      }),
    );
    expect(readLearnedQuality(bucket())).toBeNull();
  });

  it("ignores a v4-shaped bare profile name found under the current key", () => {
    window.localStorage.setItem(bucket(), "safety");
    expect(readLearnedQuality(bucket())).toBeNull();
  });

  it("rejects an entry with an unrecognised tier", () => {
    window.localStorage.setItem(
      bucket(),
      JSON.stringify({
        resolutionStep: 5,
        effects: "ludicrous",
        content: "full",
      }),
    );
    expect(readLearnedQuality(bucket())).toBeNull();
  });

  it("rejects an entry with a non-numeric resolution step", () => {
    window.localStorage.setItem(
      bucket(),
      JSON.stringify({
        resolutionStep: "high",
        effects: "lean",
        content: "full",
      }),
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
      {
        resolutionStep: 11,
        effects: "full",
        content: "full",
        survival: false,
      },
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
    expect(() =>
      writeLearnedQuality(bucket(), axes, "efficient"),
    ).not.toThrow();
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
