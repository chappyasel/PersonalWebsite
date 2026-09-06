"use client";

// Applies screenshot mode to the room. The store (screenshotMode.ts) only
// holds the answer; this is where the answer reaches the interface, the
// unit residency, the render quality, and the About stop. It mounts beside
// the canvas rather than inside it because nothing here needs a frame: the
// camera reads the live snapshot itself in CameraRig.
import {
  CHROME_HIDDEN_ATTRIBUTE,
  createFreeRoamChromeVisibility,
} from "../dom/chromeKeys";
import { useStacks } from "../store";
import { useEffect, useRef } from "react";

import { sceneQualityController } from "./sceneQualityController";
import {
  SCREENSHOT_UNIT,
  searchPinsQuality,
  useScreenshotMode,
} from "./screenshotMode";
import { sceneUnitActivityController } from "./unitActivity";

/** The H key's hide, without the Field Note. Hiding the interface for a
 * header is not the visitor discovering photo mode. */
function setChromeHiddenSilently(hidden: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute(CHROME_HIDDEN_ATTRIBUTE, hidden);
}

export default function ScreenshotModeDriver() {
  const { enabled } = useScreenshotMode();
  // Owns only the hide it introduced, like free roam: an interface the
  // owner had already hidden with H stays hidden when the mode is switched
  // off, and one they revealed with Escape while the mode was on is not
  // hidden again by leaving it.
  const chrome = useRef(
    createFreeRoamChromeVisibility({ setHidden: setChromeHiddenSilently }),
  );

  useEffect(() => {
    if (!enabled) return;
    const visibility = chrome.current;
    visibility.enter();
    sceneUnitActivityController.setSoloUnit(SCREENSHOT_UNIT);

    // A still frame has no frame budget to protect, so it gets the finish
    // the owner otherwise has to pick by hand. An explicit `?quality=` in
    // the URL is the owner asking for something else and wins.
    const pinned =
      typeof window !== "undefined" &&
      searchPinsQuality(window.location.search);
    const before = sceneQualityController.getSnapshot();
    const forcedCinematic = !pinned && !before.cinematicPlus;
    if (forcedCinematic) sceneQualityController.setMode("cinematic+");

    // The About stop is solved differently with the rail gone (no shift),
    // so re-land on it. travelTo reads the live shift through CameraRig's
    // clampedOffset, which is why this is a travel and not a scroll write.
    useStacks.getState().travelTo?.(SCREENSHOT_UNIT);

    return () => {
      sceneUnitActivityController.setSoloUnit(null);
      visibility.exit();
      const after = sceneQualityController.getSnapshot();
      // Hand the quality back only if it is still the one this mode set;
      // an owner who moved the Mode control meanwhile keeps their choice.
      if (forcedCinematic && after.cinematicPlus)
        sceneQualityController.setMode(before.mode);
      useStacks.getState().travelTo?.(SCREENSHOT_UNIT);
    };
  }, [enabled]);

  return null;
}
