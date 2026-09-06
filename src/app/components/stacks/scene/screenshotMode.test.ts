import { afterEach, describe, expect, it } from "vitest";

import {
  SCREENSHOT_DOLLY_MAX,
  SCREENSHOT_GRASS_MAX,
  SCREENSHOT_MODE_DEFAULT,
  clampScreenshotDolly,
  screenshotDollyKeyDelta,
  screenshotFovFromValue,
  screenshotModeController,
  screenshotModeFromSearch,
  screenshotModeUrl,
  searchPinsQuality,
} from "./screenshotMode";

const key = {
  key: "[",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  defaultPrevented: false,
  editableTarget: false,
} as const;

describe("screenshot mode", () => {
  afterEach(() => screenshotModeController.reset());

  it("is off without the parameter and off for an explicit zero", () => {
    expect(screenshotModeFromSearch("")).toEqual(SCREENSHOT_MODE_DEFAULT);
    expect(screenshotModeFromSearch("?screenshot=0").enabled).toBe(false);
    expect(screenshotModeFromSearch("?screenshot=false").enabled).toBe(false);
    expect(screenshotModeFromSearch("?screenshot-dolly=3").enabled).toBe(false);
  });

  it("reads the dolly and lens with the switch, clamping the dolly and refusing an out-of-range lens", () => {
    expect(screenshotModeFromSearch("?screenshot=1")).toEqual({
      ...SCREENSHOT_MODE_DEFAULT,
      enabled: true,
    });
    expect(
      screenshotModeFromSearch(
        "?screenshot=1&screenshot-dolly=2.5&screenshot-fov=28",
      ),
    ).toEqual({
      ...SCREENSHOT_MODE_DEFAULT,
      enabled: true,
      dolly: 2.5,
      fov: 28,
    });
    expect(
      screenshotModeFromSearch("?screenshot=1&screenshot-dolly=40").dolly,
    ).toBe(SCREENSHOT_DOLLY_MAX);
    expect(
      screenshotModeFromSearch("?screenshot=1&screenshot-dolly=-2").dolly,
    ).toBe(0);
    expect(
      screenshotModeFromSearch("?screenshot=1&screenshot-fov=90").fov,
    ).toBeNull();
    expect(
      screenshotModeFromSearch("?screenshot=1&screenshot-fov=wide").fov,
    ).toBeNull();
  });

  it("reads the lawn values with the switch and clamps them", () => {
    const lawn = screenshotModeFromSearch(
      "?screenshot=1&screenshot-grass-lift=0.3&screenshot-grass-variation=9",
    );
    expect(lawn.grassLift).toBe(0.3);
    expect(lawn.grassVariation).toBe(SCREENSHOT_GRASS_MAX);
    expect(
      screenshotModeFromSearch("?screenshot=1&screenshot-grass-lift=tall")
        .grassLift,
    ).toBe(SCREENSHOT_MODE_DEFAULT.grassLift);
    screenshotModeController.seed(screenshotModeFromSearch("?screenshot=1"));
    screenshotModeController.setGrassLift(-1);
    expect(screenshotModeController.getSnapshot().grassLift).toBe(0);
    screenshotModeController.setGrassVariation(0.25);
    expect(screenshotModeController.getSnapshot().grassVariation).toBe(0.25);
  });

  it("treats an unreadable dolly as the default rather than NaN", () => {
    expect(clampScreenshotDolly(Number.NaN)).toBe(0);
    expect(
      screenshotModeFromSearch("?screenshot=1&screenshot-dolly=far").dolly,
    ).toBe(0);
    expect(screenshotFovFromValue("")).toBeNull();
    expect(screenshotFovFromValue(33)).toBe(33);
  });

  it("lets an explicit quality parameter win over the Cinematic+ default", () => {
    expect(searchPinsQuality("?screenshot=1")).toBe(false);
    expect(searchPinsQuality("?screenshot=1&quality=cinematic")).toBe(true);
    expect(searchPinsQuality("?quality=auto")).toBe(true);
  });

  it("writes a URL that reproduces the setup and strips it when off", () => {
    const on = screenshotModeUrl("https://chappyasel.com/?debug=1", {
      ...SCREENSHOT_MODE_DEFAULT,
      enabled: true,
      dolly: 2.5,
      fov: 28,
    });
    expect(new URL(on).searchParams.get("debug")).toBe("1");
    expect(new URL(on).searchParams.get("screenshot")).toBe("1");
    expect(new URL(on).searchParams.get("screenshot-dolly")).toBe("2.5");
    expect(new URL(on).searchParams.get("screenshot-fov")).toBe("28");
    const defaults = screenshotModeUrl("https://chappyasel.com/", {
      ...SCREENSHOT_MODE_DEFAULT,
      enabled: true,
    });
    expect(defaults).toBe("https://chappyasel.com/?screenshot=1");
    const lawn = screenshotModeUrl("https://chappyasel.com/", {
      ...SCREENSHOT_MODE_DEFAULT,
      enabled: true,
      grassLift: 0.3,
      grassVariation: 0.2,
    });
    expect(new URL(lawn).searchParams.get("screenshot-grass-lift")).toBe("0.3");
    expect(new URL(lawn).searchParams.get("screenshot-grass-variation")).toBe(
      "0.2",
    );
    const off = screenshotModeUrl(on, SCREENSHOT_MODE_DEFAULT);
    expect(off).toBe("https://chappyasel.com/?debug=1");
  });

  it("steps the dolly with the bracket keys, four steps under Shift, and nothing else", () => {
    expect(screenshotDollyKeyDelta(key)).toBe(0.25);
    expect(screenshotDollyKeyDelta({ ...key, key: "]" })).toBe(-0.25);
    expect(screenshotDollyKeyDelta({ ...key, key: "{", shiftKey: true })).toBe(
      1,
    );
    expect(screenshotDollyKeyDelta({ ...key, key: "}", shiftKey: true })).toBe(
      -1,
    );
    expect(screenshotDollyKeyDelta({ ...key, key: "h" })).toBeNull();
    expect(screenshotDollyKeyDelta({ ...key, metaKey: true })).toBeNull();
    expect(
      screenshotDollyKeyDelta({ ...key, editableTarget: true }),
    ).toBeNull();
    expect(
      screenshotDollyKeyDelta({ ...key, defaultPrevented: true }),
    ).toBeNull();
  });

  it("keeps the live store inside the same bounds as the URL", () => {
    screenshotModeController.seed(screenshotModeFromSearch("?screenshot=1"));
    screenshotModeController.nudgeDolly(100);
    expect(screenshotModeController.getSnapshot().dolly).toBe(
      SCREENSHOT_DOLLY_MAX,
    );
    screenshotModeController.nudgeDolly(-100);
    expect(screenshotModeController.getSnapshot().dolly).toBe(0);
    screenshotModeController.setFov(60);
    expect(screenshotModeController.getSnapshot().fov).toBeNull();
    screenshotModeController.setFov(30);
    expect(screenshotModeController.getSnapshot().fov).toBe(30);
    screenshotModeController.reset();
    expect(screenshotModeController.getSnapshot()).toEqual(
      SCREENSHOT_MODE_DEFAULT,
    );
  });
});
