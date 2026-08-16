import { describe, expect, it } from "vitest";

import { canRevealWorld } from "./loading";

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
