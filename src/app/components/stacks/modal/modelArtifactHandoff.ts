import type { SceneArtifactId } from "../sceneArtifacts";

export type ModelArtifactViewportBounds = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type ModelArtifactCameraTarget = Readonly<{
  bounds: ModelArtifactViewportBounds;
  /** Projected bounds of the live scene source. Image handoffs use this to
   * scale the real object by the same ratio as the fullscreen photo. */
  sourceBounds?: ModelArtifactViewportBounds;
  cameraRelativeQuaternion: readonly [number, number, number, number];
}>;

export type ModelArtifactHandoffPhase =
  | "lifting"
  | "waiting-for-preview"
  | "crossfading-in"
  | "inspecting"
  | "crossfading-out"
  | "returning";

export type ModelArtifactHandoffState = Readonly<{
  artifactId: SceneArtifactId;
  phase: ModelArtifactHandoffPhase;
  target: ModelArtifactCameraTarget | null;
  sourceAtTarget: boolean;
  reducedMotion: boolean;
}>;

export type ModelArtifactHandoffEvent =
  | Readonly<{ type: "preview-ready"; target: ModelArtifactCameraTarget }>
  | Readonly<{ type: "source-crossfade-point" }>
  | Readonly<{ type: "source-at-target" }>
  | Readonly<{ type: "source-hidden" }>
  | Readonly<{ type: "close" }>
  | Readonly<{ type: "source-visible" }>
  | Readonly<{ type: "source-home" }>;

export function beginModelArtifactHandoff(
  artifactId: SceneArtifactId,
  reducedMotion: boolean,
): ModelArtifactHandoffState {
  return {
    artifactId,
    phase: "lifting",
    target: null,
    sourceAtTarget: false,
    reducedMotion,
  };
}

export function reduceModelArtifactHandoff(
  state: ModelArtifactHandoffState,
  event: ModelArtifactHandoffEvent,
): ModelArtifactHandoffState | null {
  switch (event.type) {
    case "preview-ready":
      return {
        ...state,
        target: event.target,
        phase:
          state.phase === "waiting-for-preview"
            ? "crossfading-in"
            : state.phase,
      };
    case "source-crossfade-point":
      if (state.phase !== "lifting" || !state.target) return state;
      return { ...state, phase: "crossfading-in" };
    case "source-at-target":
      if (state.phase === "crossfading-in")
        return { ...state, sourceAtTarget: true };
      if (state.phase !== "lifting") return state;
      return {
        ...state,
        sourceAtTarget: true,
        phase: state.target ? "crossfading-in" : "waiting-for-preview",
      };
    case "source-hidden":
      return state.phase === "crossfading-in" && state.sourceAtTarget
        ? { ...state, phase: "inspecting" }
        : state;
    case "close":
      if (state.phase === "lifting" || state.phase === "waiting-for-preview")
        return { ...state, phase: "returning" };
      if (state.phase === "crossfading-in" || state.phase === "inspecting")
        return { ...state, phase: "crossfading-out" };
      return state;
    case "source-visible":
      return state.phase === "crossfading-out"
        ? { ...state, phase: "returning" }
        : state;
    case "source-home":
      return state.phase === "returning" ? null : state;
  }
}

export function modelArtifactPreviewVisible(
  phase: ModelArtifactHandoffPhase,
): boolean {
  return phase === "crossfading-in" || phase === "inspecting";
}
