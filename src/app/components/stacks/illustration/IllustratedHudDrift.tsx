"use client";

import { UNIT_COUNT } from "../data";
import { dimensionTravel } from "../input/dimensionTravel";
import { roomResidency } from "../room/roomResidency";
import { screenshotModeController } from "../scene/screenshotMode";
import { useHudDrift, useHudDriftProfile } from "../scene/useHudDrift";
import { useStacks } from "../store";
import { type RefObject, useEffect } from "react";

type Props = { root: RefObject<HTMLElement | null> };

function IllustratedDriftFrame({ root, mobile }: Props & { mobile: boolean }) {
  const advance = useHudDrift(root, mobile, false);
  useEffect(() => {
    const pointer = { x: 0, y: 0 };
    let previous: number | null = null;
    let frame = 0;
    const tick = (now: number) => {
      const state = useStacks.getState();
      const position =
        dimensionTravel.readIllustratedPosition?.() ?? state.activeUnit;
      const active =
        roomResidency.getSnapshot().active &&
        !state.visionRideRoomHidden &&
        !state.modelArtifactHandoff &&
        !screenshotModeController.getSnapshot().enabled;
      advance(
        pointer,
        previous === null ? 0 : (now - previous) / 1000,
        position / (UNIT_COUNT - 1),
        active,
      );
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [advance, mobile]);
  return null;
}

export function IllustratedHudDrift({ root }: Props) {
  const profile = useHudDriftProfile(false);
  return profile === "off" ? null : (
    <IllustratedDriftFrame
      key={profile}
      root={root}
      mobile={profile === "mobile"}
    />
  );
}
