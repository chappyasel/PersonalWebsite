import { describe, expect, it } from "vitest";

import {
  IPHONE_15_SCREEN,
  PHONE_SCREEN_ASPECT,
  type PhoneScreenPainter,
  paintPhoneScreen,
  phoneScreenLayout,
} from "./phoneScreenLayout";

describe("phone screen layout", () => {
  it("keeps the iPhone 15 panel's proportions at any texture width", () => {
    const layout = phoneScreenLayout(512);
    expect(layout.height).toBe(Math.round(512 * PHONE_SCREEN_ASPECT));
    expect(layout.height / layout.width).toBeCloseTo(852 / 393, 2);
    const scale = 512 / IPHONE_15_SCREEN.widthPt;
    expect(layout.corner).toBeCloseTo(55 * scale, 6);
  });

  it("centres the Dynamic Island as a pill 11 pt below the top", () => {
    const layout = phoneScreenLayout(393);
    expect(layout.island).toEqual({
      x: (393 - 126) / 2,
      y: 11,
      width: 126,
      height: 37,
    });
    expect(layout.island.x + layout.island.width / 2).toBe(393 / 2);
  });
});

describe("phone screen painter", () => {
  function recorder() {
    const calls: string[] = [];
    const ctx = {
      fillStyle: "" as string,
      clearRect: () => calls.push("clear"),
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      beginPath: () => calls.push("begin"),
      roundRect: (x: number, y: number, w: number, h: number, r: number) =>
        calls.push(`round ${x},${y},${w},${h},${r}`),
      clip: () => calls.push("clip"),
      fill: () => calls.push(`fill ${ctx.fillStyle}`),
      drawImage: () => calls.push("image"),
    };
    return { ctx: ctx as unknown as PhoneScreenPainter, calls };
  }

  it("clips the picture to the corners, then paints the island over it", () => {
    const layout = phoneScreenLayout(393);
    const { ctx, calls } = recorder();
    paintPhoneScreen(ctx, {} as CanvasImageSource, layout);
    expect(calls).toEqual([
      "clear",
      "save",
      "begin",
      "round 0,0,393,852,55",
      "clip",
      "image",
      "begin",
      "round 133.5,11,126,37,18.5",
      "fill #000000",
      "restore",
    ]);
  });

  it("leaves the panel black before the picture arrives", () => {
    const layout = phoneScreenLayout(393);
    const { ctx, calls } = recorder();
    paintPhoneScreen(ctx, null, layout);
    expect(calls).not.toContain("image");
    expect(calls.filter((c) => c === "fill #000000")).toHaveLength(2);
  });
});
