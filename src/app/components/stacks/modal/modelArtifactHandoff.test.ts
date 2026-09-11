import { describe, expect, it } from "vitest";

import {
  type ModelArtifactHandoffState,
  beginModelArtifactHandoff,
  modelArtifactPreviewVisible,
  reduceModelArtifactHandoff,
} from "./modelArtifactHandoff";

const target = {
  bounds: { left: 400, top: 120, width: 320, height: 320 },
  cameraRelativeQuaternion: [0, 0, 0, 1] as const,
};

function event(
  state: ModelArtifactHandoffState,
  next: Parameters<typeof reduceModelArtifactHandoff>[1],
) {
  const result = reduceModelArtifactHandoff(state, next);
  if (!result) throw new Error("Expected the handoff to remain active");
  return result;
}

describe("model artifact handoff", () => {
  it("moves the source before revealing and freezing the inspection scene", () => {
    let state = beginModelArtifactHandoff("portrait", false);
    expect(state.phase).toBe("lifting");
    expect(modelArtifactPreviewVisible(state.phase)).toBe(false);

    state = event(state, { type: "preview-ready", target });
    expect(state.phase).toBe("lifting");
    state = event(state, { type: "source-crossfade-point" });
    expect(state.phase).toBe("crossfading-in");
    expect(modelArtifactPreviewVisible(state.phase)).toBe(true);
    expect(event(state, { type: "source-hidden" }).phase).toBe(
      "crossfading-in",
    );

    state = event(state, { type: "source-at-target" });
    expect(state.phase).toBe("crossfading-in");
    expect(state.sourceAtTarget).toBe(true);

    state = event(state, { type: "source-hidden" });
    expect(state.phase).toBe("inspecting");
  });

  it("holds the real object at the camera until a slow preview is ready", () => {
    let state = beginModelArtifactHandoff("portrait", false);
    state = event(state, { type: "source-at-target" });
    expect(state.phase).toBe("waiting-for-preview");
    expect(modelArtifactPreviewVisible(state.phase)).toBe(false);

    state = event(state, { type: "preview-ready", target });
    expect(state.phase).toBe("crossfading-in");
  });

  it("crossfades back before returning the real object to the shelf", () => {
    let state: ModelArtifactHandoffState = {
      ...beginModelArtifactHandoff("portrait", false),
      phase: "inspecting",
      target,
    };
    state = event(state, { type: "close" });
    expect(state.phase).toBe("crossfading-out");
    state = event(state, { type: "source-visible" });
    expect(state.phase).toBe("returning");
    expect(
      reduceModelArtifactHandoff(state, { type: "source-home" }),
    ).toBeNull();
  });

  it("reverses a pickup immediately when it closes before inspection", () => {
    const lifting = beginModelArtifactHandoff("portrait", false);
    expect(event(lifting, { type: "close" }).phase).toBe("returning");
  });
});
