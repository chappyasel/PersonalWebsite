"use client";

// The scene tells the fullscreen preview what edges each photo has.
//
// Every photo in the room is a physical print: paper around a flat print, a
// mat and a frame around a desk frame, a white mount under a corkboard pin.
// The preview used to enlarge the bare image, so the morph out of the scene
// visibly shed its edges on the way up. The forms now describe themselves
// here, keyed by the artifact they display, and the inspector draws the same
// edges around the enlarged photo.
//
// Registration is at render time rather than a hand-copied table because the
// proportions live in the forms' props, spread across six unit files. A
// table would drift the first time someone resized a frame.
import type {
  ArtifactPreviewFrame,
  ArtifactPreviewFrameAccent,
  ArtifactPreviewFrameLayer,
} from "../modal/artifactPreviewFrame";
import { type SceneArtifactId, sceneArtifactById } from "../sceneArtifacts";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

import captured from "./artifactPreviewFrames.generated.json";

/** Grabbable provides the artifact it opens, so a form nested anywhere under
 * it can register its edges without each call site threading the id. */
export const SceneArtifactIdContext = createContext<SceneArtifactId | null>(
  null,
);

export type ArtifactPreviewFrames = ReadonlyMap<
  SceneArtifactId,
  ArtifactPreviewFrame
>;

/** Captured frames, as a base the live registry writes over.
 *
 * A frame is registered by the scene component that draws the photo, so
 * without a renderer there is nothing to register and every preview falls
 * back to BARE_ARTIFACT_PREVIEW_FRAME. That is correct in 3D and wrong in
 * the 2D illustration, which opens the same inspector from a drawing.
 *
 * So the capture is the floor and a live registration is the override: in
 * the room a form still publishes its own edges and wins for its id, and in
 * 2D the captured record stands. Inert JSON rather than an import of the
 * scene modules that hold the layer constants — reaching those pulls
 * @react-three/drei and fiber onto the homepage's initial graph, which
 * initialGraph.test.ts exists to prevent.
 *
 * Regenerate with `pnpm generate:artifact-frames`. */
const CAPTURED: ArtifactPreviewFrames = new Map(
  Object.entries(captured as Record<string, ArtifactPreviewFrame>) as [
    SceneArtifactId,
    ArtifactPreviewFrame,
  ][],
);
/** What forms have registered in this session, kept apart from the capture
 * so a release can restore the captured frame rather than delete the id, and
 * so a regeneration reads only what the room actually drew. A photo removed
 * from the scene then disappears from the next capture instead of echoing
 * out of the file it is being rewritten from. */
let live: ReadonlyMap<SceneArtifactId, ArtifactPreviewFrame> = new Map();
let snapshot: ArtifactPreviewFrames = CAPTURED;
const listeners = new Set<() => void>();

function publish(next: Map<SceneArtifactId, ArtifactPreviewFrame>) {
  live = next;
  snapshot = next.size ? new Map([...CAPTURED, ...next]) : CAPTURED;
  for (const listener of listeners) listener();
}

/** How far a form's image plane may differ from its source's aspect before
 * it is cropping. The preview shows the whole photo, so a plane cut to a
 * different shape shows a different picture on the shelf than in the
 * preview, and the morph between them visibly re-crops. */
export const ARTIFACT_PLANE_ASPECT_TOLERANCE = 0.005;

/** Relative difference between a form's plane aspect and its source's, or
 * null when the id is not an image artifact. */
export function artifactPlaneAspectMismatch(
  id: SceneArtifactId,
  plane: Readonly<{ width: number; height: number }>,
): Readonly<{ plane: number; source: number; relative: number }> | null {
  const artifact = sceneArtifactById(id);
  if (!artifact || artifact.kind !== "image") return null;
  const source = artifact.width / artifact.height;
  const planeAspect = plane.width / plane.height;
  return {
    plane: planeAspect,
    source,
    relative: Math.abs(planeAspect - source) / source,
  };
}

export function registerArtifactPreviewFrame(
  id: SceneArtifactId,
  frame: ArtifactPreviewFrame,
) {
  if (process.env.NODE_ENV !== "production") {
    const mismatch = artifactPlaneAspectMismatch(id, frame.image);
    if (mismatch && mismatch.relative > ARTIFACT_PLANE_ASPECT_TOLERANCE)
      console.warn(
        `[stacks] ${id}: scene plane aspect ${mismatch.plane.toFixed(3)} vs source ${mismatch.source.toFixed(3)}. The shelf crops a photo the preview shows whole; cut the plane to the source's aspect.`,
      );
  }
  publish(new Map(live).set(id, frame));
  return () => {
    if (live.get(id) !== frame) return;
    const next = new Map(live);
    next.delete(id);
    publish(next);
  };
}

export function artifactPreviewFrameFor(
  id: SceneArtifactId,
): ArtifactPreviewFrame | null {
  return snapshot.get(id) ?? null;
}

export function readArtifactPreviewFrames() {
  return snapshot;
}

/** Only what this session's forms registered. The capture script writes this,
 * never the merged view, so the generated file cannot feed itself. */
export function readLiveArtifactPreviewFrames() {
  return live;
}

export function subscribeArtifactPreviewFrames(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The live registry as an immutable map, replaced whenever a form mounts
 * or leaves, so a preview opened before a photo's form mounted still picks
 * up its edges. */
export function useArtifactPreviewFrames(): ArtifactPreviewFrames {
  return useSyncExternalStore(
    subscribeArtifactPreviewFrames,
    readArtifactPreviewFrames,
    readArtifactPreviewFrames,
  );
}

/** Called by a photo's physical form. `layers` must be a stable reference
 * (a module constant per form), so the registration effect keys on the
 * image size alone and does not churn every render. */
export function useRegisterArtifactPreviewFrame(
  imageWidth: number,
  imageHeight: number,
  layers: readonly ArtifactPreviewFrameLayer[],
  accents?: readonly ArtifactPreviewFrameAccent[],
  previewSrc?: string,
) {
  const id = useContext(SceneArtifactIdContext);
  useEffect(() => {
    if (!id) return;
    return registerArtifactPreviewFrame(id, {
      image: { width: imageWidth, height: imageHeight },
      layers,
      accents,
      previewSrc,
    });
  }, [id, imageWidth, imageHeight, layers, accents, previewSrc]);
}

/** Test seam. */
export function resetArtifactPreviewFramesForTests() {
  publish(new Map());
}
