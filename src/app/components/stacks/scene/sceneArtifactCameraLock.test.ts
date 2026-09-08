import type { ModelArtifactHandoffPhase } from "../modal/modelArtifactHandoff";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  type SceneArtifactCameraLockState,
  sceneArtifactCameraLockFrame,
} from "./sceneArtifactCameraLock";

const cameraRig = fs.readFileSync(
  new URL("./CameraRig.tsx", import.meta.url),
  "utf8",
);

const HANDOFF_PHASES = [
  "lifting",
  "waiting-for-preview",
  "crossfading-in",
  "inspecting",
  "crossfading-out",
  "returning",
] as const satisfies readonly ModelArtifactHandoffPhase[];

describe("scene artifact camera lock", () => {
  it.each(HANDOFF_PHASES)("locks the camera during %s", (phase) => {
    expect(sceneArtifactCameraLockFrame("released", phase)).toEqual({
      locked: true,
      nextState: "handoff",
    });
  });

  it("holds one release frame after source-home", () => {
    let state: SceneArtifactCameraLockState = "released";
    let frame = sceneArtifactCameraLockFrame(state, "returning");
    state = frame.nextState;
    expect(frame.locked).toBe(true);

    frame = sceneArtifactCameraLockFrame(state, null);
    state = frame.nextState;
    expect(frame.locked).toBe(true);

    frame = sceneArtifactCameraLockFrame(state, null);
    expect(frame.locked).toBe(false);
  });

  it("returns before camera pose and sheet coverage updates", () => {
    const lockReturn = cameraRig.indexOf("if (lockFrame.locked) return;");
    expect(lockReturn).toBeGreaterThan(-1);
    expect(lockReturn).toBeLessThan(
      cameraRig.indexOf("if (freeRoamEnabled)", lockReturn),
    );
    expect(lockReturn).toBeLessThan(
      cameraRig.indexOf("const coverage = panelCoverageRef.current"),
    );
    expect(lockReturn).toBeLessThan(
      cameraRig.indexOf(
        "camera.position.set(authoredEyeX, authoredEyeY, authoredEyeZ)",
      ),
    );
    expect(cameraRig).toContain(
      "if (useStacks.getState().modelArtifactHandoff) return;",
    );
  });
});
