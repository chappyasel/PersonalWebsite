import { describe, expect, it } from "vitest";

import geometry from "./illustration/artwork/hotspots.generated.json";
import { SCENE_ARTIFACTS, sceneArtifactByArtworkId } from "./sceneArtifacts";
import { useStacks } from "./store";

type CapturedGeometry = { parts: { id: string }[] };

/** Every id the illustration actually draws, across units, themes and
 * viewports. */
const DRAWN = new Set(
  Object.values(geometry as Record<string, CapturedGeometry>).flatMap(
    (capture) => capture.parts.map((part) => part.id),
  ),
);

describe("resolving an artifact from the id the artwork draws it under", () => {
  it("reads the hyphenated spelling of an interaction id", () => {
    const artifact = sceneArtifactByArtworkId("grab-photo-talk-panel-v8");
    expect(artifact?.id).toBe("talk-panel-v8");
    expect(artifact?.interactionId).toBe("grab:photo:talk-panel-v8");
  });

  it("reads the same spelling for the training figures", () => {
    expect(
      sceneArtifactByArtworkId("action-training-figure-big-three")?.id,
    ).toBe("big-three");
  });

  it("returns null rather than guessing", () => {
    // The colon form belongs to the live room's interaction registry; the
    // artwork never spells it that way, and accepting both would hide a
    // drawing that had drifted onto the wrong id.
    expect(sceneArtifactByArtworkId("grab:photo:talk-panel-v8")).toBeNull();
    expect(sceneArtifactByArtworkId("grab-photo-retired-print-v1")).toBeNull();
    expect(sceneArtifactByArtworkId("vision-pro")).toBeNull();
  });

  it("leaves no print drawn in 2D without an artifact behind it", () => {
    // A hotspot that resolves to nothing gets no label and no action, and
    // does so silently: the object is still clickable and still does nothing.
    // Renaming an artifact without redrawing is the way that happens.
    const orphans = [...DRAWN].filter(
      (id) =>
        (id.startsWith("grab-photo-") ||
          id.startsWith("action-training-figure-")) &&
        !sceneArtifactByArtworkId(id),
    );
    expect(orphans).toEqual([]);
  });

  it("agrees with the catalog on how many of its prints are hung", () => {
    // Not every artifact is drawn — the About unit's photos have no hotspots
    // yet — so this is a floor, not equality. It exists to notice the
    // mapping breaking wholesale rather than one id at a time.
    const resolved = SCENE_ARTIFACTS.filter((artifact) =>
      DRAWN.has(artifact.interactionId.replaceAll(":", "-")),
    );
    expect(resolved.length).toBeGreaterThanOrEqual(25);
  });
});

describe("opening a print that has no live object behind it", () => {
  it("clears modalOpen on close so the next print can open", () => {
    const store = useStacks.getState();
    // What 2D does: no scene source, so no handoff.
    store.openSceneArtifact("talk-panel-v8", true, false);
    expect(useStacks.getState().modalOpen).toBe(true);
    expect(useStacks.getState().modelArtifactHandoff).toBeNull();

    // What the inspector does on the way out.
    useStacks.getState().closeSceneArtifact();
    useStacks.getState().finishSceneArtifactClose();

    // The bug was here: a handoff begun without a renderer never reaches
    // `source-home`, so modalOpen stayed true and every later open was
    // declined by its guard.
    expect(useStacks.getState().inspectedArtifact).toBeNull();
    expect(useStacks.getState().modalOpen).toBe(false);

    useStacks.getState().openSceneArtifact("talk-dc-policy-v8", true, false);
    expect(useStacks.getState().inspectedArtifact).toBe("talk-dc-policy-v8");
  });

  it("still begins a handoff when the room is live", () => {
    useStacks.setState({
      modalOpen: false,
      inspectedArtifact: null,
      modelArtifactHandoff: null,
    });
    useStacks.getState().openSceneArtifact("talk-panel-v8", true);
    expect(useStacks.getState().modelArtifactHandoff?.phase).toBe("lifting");
  });
});
