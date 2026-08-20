import { describe, expect, it } from "vitest";

import {
  assetLoadComplete,
  canRevealWorld,
  isAssetLoadReady,
  isMeadowReady,
  markMeadowReady,
  reportAssetLoadState,
  resetAssetLoadReady,
  resetMeadowReady,
} from "./loading";

describe("homepage world reveal gate", () => {
  it("waits for the loader's first item-by-item pass even when WebGL is ready", () => {
    expect(
      canRevealWorld({
        assetsReady: true,
        meadowReady: true,
        bootSequenceReady: false,
      }),
    ).toBe(false);
  });

  it("reveals once scene readiness and the boot pass are both satisfied", () => {
    expect(
      canRevealWorld({
        assetsReady: true,
        meadowReady: true,
        bootSequenceReady: true,
      }),
    ).toBe(true);
  });

  it("does not reveal a partially streamed room", () => {
    expect(
      canRevealWorld({
        assetsReady: false,
        meadowReady: true,
        bootSequenceReady: true,
      }),
    ).toBe(false);
  });

  it("does not reveal before the meadow mounts", () => {
    expect(
      canRevealWorld({
        assetsReady: true,
        meadowReady: false,
        bootSequenceReady: true,
      }),
    ).toBe(false);
  });
});

describe("homepage asset readiness", () => {
  it("requires a successful idle loading manager with at least one asset", () => {
    expect(
      assetLoadComplete({ active: true, loaded: 10, total: 10, errors: 0 }),
    ).toBe(false);
    expect(
      assetLoadComplete({ active: false, loaded: 0, total: 0, errors: 0 }),
    ).toBe(false);
    expect(
      assetLoadComplete({ active: false, loaded: 9, total: 10, errors: 0 }),
    ).toBe(false);
    expect(
      assetLoadComplete({ active: false, loaded: 10, total: 10, errors: 1 }),
    ).toBe(false);
    expect(
      assetLoadComplete({ active: false, loaded: 10, total: 10, errors: 0 }),
    ).toBe(true);
  });

  it("requires an idle window and resets it when another batch starts", () => {
    resetAssetLoadReady();
    reportAssetLoadState(
      { active: false, loaded: 10, total: 10, errors: 0 },
      1_000,
    );
    expect(isAssetLoadReady(1_199, 200)).toBe(false);
    expect(isAssetLoadReady(1_200, 200)).toBe(true);

    reportAssetLoadState(
      { active: true, loaded: 10, total: 11, errors: 0 },
      1_250,
    );
    expect(isAssetLoadReady(2_000, 200)).toBe(false);
  });
});

describe("homepage meadow readiness", () => {
  it("can be reset before a new world instance mounts", () => {
    markMeadowReady();
    expect(isMeadowReady()).toBe(true);

    resetMeadowReady();
    expect(isMeadowReady()).toBe(false);
  });
});
