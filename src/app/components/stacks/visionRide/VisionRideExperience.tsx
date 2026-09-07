"use client";

import { sceneAudio } from "../audio/sceneAudio";
import { useStacks } from "../store";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  lazy,
  useEffect,
  useMemo,
} from "react";

import VisionRideTransition from "./VisionRideTransition";
import {
  useVisionRidePreviewOverrides,
  visionRidePreviewModifiers,
} from "./visionRideDiagnostics";
import { resolveVisionRideProfile } from "./visionRideProfiles";
import type { VisionRideTerrainTier } from "./visionRideTerrain";

const VisionRideWorld = lazy(() => import("./VisionRideWorld"));

class VisionRideErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function VisionRideExperience({
  dark,
  tier,
}: {
  dark: boolean;
  tier: VisionRideTerrainTier;
}) {
  const phase = useStacks((state) => state.visionRidePhase);
  const sessionProfile = useStacks((state) => state.visionRideSessionProfile);
  const preview = useVisionRidePreviewOverrides();
  const profile = useMemo(() => {
    const modifiers = visionRidePreviewModifiers(preview.scenePreview);
    return resolveVisionRideProfile({
      ...sessionProfile,
      ...(modifiers ?? null),
      pixelLook:
        preview.finishPreview === "authored"
          ? sessionProfile.pixelLook
          : preview.finishPreview,
    });
  }, [preview.finishPreview, preview.scenePreview, sessionProfile]);
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    if (phase === "donning") sceneAudio.startVisionRide(reducedMotion);
    if (phase === "cruising") sceneAudio.beginVisionRideSwitchOn();
    if (phase === "doffing") {
      sceneAudio.finishVisionRideEntry();
      sceneAudio.beginVisionRideExit();
    }
    if (phase === "returning" || phase === "idle") sceneAudio.stopVisionRide();
  }, [phase, reducedMotion]);

  return (
    <>
      {(phase === "donning" || phase === "cruising" || phase === "doffing") && (
        <VisionRideErrorBoundary
          onError={(error) => useStacks.getState().failVisionRide(error)}
        >
          <Suspense fallback={null}>
            <VisionRideWorld tier={tier} profile={profile} />
          </Suspense>
        </VisionRideErrorBoundary>
      )}
      <VisionRideTransition dark={dark} />
    </>
  );
}
