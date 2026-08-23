import type { ModelArtifactHandoffPhase } from "../modal/modelArtifactHandoff";

export type SceneArtifactCameraLockState = "released" | "handoff";

export function sceneArtifactCameraLockFrame(
  state: SceneArtifactCameraLockState,
  phase: ModelArtifactHandoffPhase | null,
): Readonly<{
  locked: boolean;
  nextState: SceneArtifactCameraLockState;
}> {
  const handoffActive = phase !== null;
  return {
    locked: handoffActive || state === "handoff",
    nextState: handoffActive ? "handoff" : "released",
  };
}
