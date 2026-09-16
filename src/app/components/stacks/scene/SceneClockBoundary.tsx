"use client";

import { useStacks } from "../store";
import { useStore } from "@react-three/fiber";
import { useLayoutEffect } from "react";

import { desktopMotionPreference } from "~/lib/desktopMotionPreference";

import { coordinationGlobeDiagnosticsController } from "./coordinationGlobeDiagnostics";
import { COORDINATION_GLOBE_INTERACTION_ID } from "./coordinationNetwork";
import { coordinationSceneMotion } from "./coordinationSceneMotion";
import { preserveSceneClock } from "./sceneClock";

/** Attach to an existing canvas too, including after a development update. */
export default function SceneClockBoundary() {
  const store = useStore();
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    preserveSceneClock(store.getState(), (delta) => {
      const state = useStacks.getState();
      const engaged =
        coordinationGlobeDiagnosticsController.getSnapshot().effectEnabled &&
        (state.hovered === COORDINATION_GLOBE_INTERACTION_ID ||
          state.focusedInteraction === COORDINATION_GLOBE_INTERACTION_ID ||
          state.dragging === COORDINATION_GLOBE_INTERACTION_ID);
      return coordinationSceneMotion.advance(
        delta,
        engaged,
        !media.matches && !desktopMotionPreference.getSnapshot(),
      );
    });
  }, [store]);
  return null;
}
