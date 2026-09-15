"use client";

import { worldBoot } from "../boot/worldBootSession";
import { progressRef, useStacks } from "../store";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useSyncExternalStore } from "react";

import { freeRoamDiagnosticsController } from "./freeRoamDiagnostics";
import { screenshotModeController } from "./screenshotMode";
import { useHudDrift, useHudDriftProfile } from "./useHudDrift";

/** Read eased travel after CameraRig publishes the current frame. */
function DriftFrame({ mobile }: { mobile: boolean }) {
  const canvas = useThree((state) => state.gl.domElement);
  const root = useMemo(() => ({ current: canvas }), [canvas]);
  const advance = useHudDrift(root, mobile);
  useFrame((scene, delta) => {
    const boot = worldBoot.getView();
    const state = useStacks.getState();
    advance(
      scene.pointer,
      delta,
      progressRef.current,
      boot.revealed &&
        boot.presentation === "live" &&
        !state.visionRideRoomHidden &&
        !state.modelArtifactHandoff &&
        !freeRoamDiagnosticsController.getSnapshot().enabled &&
        !screenshotModeController.getSnapshot().enabled,
    );
  });
  return null;
}

const subscribeBoot = (listener: () => void) => worldBoot.subscribe(listener);
const getPresentation = () => worldBoot.getView().presentation;

export default function HudCameraDrift() {
  const presentation = useSyncExternalStore(
    subscribeBoot,
    getPresentation,
    getPresentation,
  );
  const profile = useHudDriftProfile();
  return profile === "off" || presentation !== "live" ? null : (
    <DriftFrame key={profile} mobile={profile === "mobile"} />
  );
}
