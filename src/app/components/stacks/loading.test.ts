import { describe, expect, it } from "vitest";

import {
  canRevealWorld,
  isMeadowReady,
  markMeadowReady,
  resetMeadowReady,
} from "./loading";

describe("homepage world reveal gate", () => {
  it("waits for the loader's first item-by-item pass even when WebGL is ready", () => {
    expect(
      canRevealWorld({
        assetsReady: true,
        streamGraceExpired: false,
        meadowReady: true,
        meadowWaitExpired: false,
        bootSequenceReady: false,
      }),
    ).toBe(false);
  });

  it("reveals once scene readiness and the boot pass are both satisfied", () => {
    expect(
      canRevealWorld({
        assetsReady: true,
        streamGraceExpired: false,
        meadowReady: true,
        meadowWaitExpired: false,
        bootSequenceReady: true,
      }),
    ).toBe(true);
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
