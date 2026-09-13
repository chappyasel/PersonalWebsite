"use client";

import {
  ABOUT_BOOT_STAGE_GEOMETRY,
  aboutBootStageForViewport,
} from "../boot/aboutBootStage";
import { clampCameraZoom } from "../scene/cameraZoom";
import {
  RAIL_RIGHT_PX_FALLBACK,
  STACKS_DESKTOP_MIN_WIDTH,
} from "../scene/worldLayout";
import {
  getPanelFraming,
  railRightPxRef,
  subscribePanelFraming,
} from "../store";
import { type RefObject, useLayoutEffect } from "react";

/** Follow the sheet's motion stream; no renderer, frame loop, or React updates. */
export function useIllustrationSheetFraming(
  root: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  unit: number,
) {
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !enabled) return;
    let restShift = 0;
    let zoomScale = 1;
    const publish = () => {
      const framing = getPanelFraming();
      const narrow = innerWidth < STACKS_DESKTOP_MIN_WIDTH;
      const shift =
        narrow && framing
          ? restShift - (innerHeight * framing.coverage) / 2
          : 0;
      const scale =
        narrow && framing ? 1 + (zoomScale - 1) * framing.expansion : 1;
      element.style.setProperty("--room-sheet-shift", `${shift}px`);
      element.style.setProperty("--room-sheet-scale", String(scale));
      element.style.setProperty(
        "--room-sheet-origin-y",
        `${innerHeight / 2 - restShift}px`,
      );
    };
    const measure = () => {
      const stage = aboutBootStageForViewport(
        innerWidth,
        innerHeight,
        railRightPxRef.current || RAIL_RIGHT_PX_FALLBACK,
        ABOUT_BOOT_STAGE_GEOMETRY,
        unit,
      );
      const camera = stage.camera!;
      restShift = camera.imageShiftUp;
      const distance = Math.hypot(
        ...camera.eye.map((value, index) => value - camera.aim[index]!),
      );
      // CameraRig's panel lean moves the eye 0.6 scene units toward the shelf.
      const zoom = clampCameraZoom(0.6, distance);
      zoomScale = distance / (distance - zoom);
      publish();
    };
    measure();
    const unsubscribe = subscribePanelFraming(publish);
    window.addEventListener("resize", measure);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", measure);
      for (const property of [
        "--room-sheet-shift",
        "--room-sheet-scale",
        "--room-sheet-origin-y",
      ])
        element.style.removeProperty(property);
    };
  }, [root, enabled, unit]);
}
