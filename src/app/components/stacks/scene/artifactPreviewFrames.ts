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

/** Grabbable provides the artifact it opens, so a form nested anywhere under
 * it can register its edges without each call site threading the id. */
export const SceneArtifactIdContext = createContext<SceneArtifactId | null>(
  null,
);

export type ArtifactPreviewFrames = ReadonlyMap<
  SceneArtifactId,
  ArtifactPreviewFrame
>;

const EMPTY: ArtifactPreviewFrames = new Map();
let snapshot: ArtifactPreviewFrames = EMPTY;
const listeners = new Set<() => void>();

function publish(next: Map<SceneArtifactId, ArtifactPreviewFrame>) {
  snapshot = next;
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
  publish(new Map(snapshot).set(id, frame));
  return () => {
    if (snapshot.get(id) !== frame) return;
    const next = new Map(snapshot);
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
) {
  const id = useContext(SceneArtifactIdContext);
  useEffect(() => {
    if (!id) return;
    return registerArtifactPreviewFrame(id, {
      image: { width: imageWidth, height: imageHeight },
      layers,
      accents,
    });
  }, [id, imageWidth, imageHeight, layers, accents]);
}

/** Test seam. */
export function resetArtifactPreviewFramesForTests() {
  publish(new Map());
}
