"use client";

import {
  BARE_ARTIFACT_PREVIEW_FRAME,
  framedArtifactPreviewSize,
} from "./modal/artifactPreviewFrame";
import { artifactPreviewFrameFor } from "./scene/artifactPreviewFrames";
import {
  type ProjectedSceneInteractionRect,
  projectSceneInteractionRect,
} from "./scene/interactionRegistry";
import {
  type SceneArtifact,
  type SceneArtifactId,
  sceneArtifactById,
  sceneArtifactCollection,
} from "./sceneArtifacts";
import { useStacks } from "./store";

const HISTORY_KEY = "stacksSceneArtifact";

type SceneArtifactPreviewViewport = Readonly<{
  width: number;
  height: number;
}>;

export type SceneArtifactPreviewOriginSession = Readonly<{
  collection: SceneArtifact["collection"];
  viewport: SceneArtifactPreviewViewport;
  origins: ReadonlyMap<SceneArtifactId, ProjectedSceneInteractionRect>;
  /** Settled shelf destinations for the reverse morph. The selected print can
   * be hover-lifted when `origins` is captured, so close cannot reuse it. */
  returnOrigins: ReadonlyMap<SceneArtifactId, ProjectedSceneInteractionRect>;
}>;

let sceneArtifactPreviewOriginSession: SceneArtifactPreviewOriginSession | null =
  null;
const stagedReturnOrigins = new Map<
  SceneArtifactId,
  ProjectedSceneInteractionRect
>();

function currentPreviewViewport(): SceneArtifactPreviewViewport {
  return typeof window === "undefined"
    ? { width: 0, height: 0 }
    : { width: window.innerWidth, height: window.innerHeight };
}

export function readSceneArtifactPreviewOriginSession() {
  return sceneArtifactPreviewOriginSession;
}

export function sceneArtifactPreviewOriginSessionMatchesViewport(
  session: SceneArtifactPreviewOriginSession | null,
  viewport: SceneArtifactPreviewViewport,
) {
  return Boolean(
    session?.viewport.width === viewport.width &&
      session?.viewport.height === viewport.height,
  );
}

export function imageRatioPreviewOrigin(
  origin: ProjectedSceneInteractionRect,
  imageWidth: number,
  imageHeight: number,
): ProjectedSceneInteractionRect {
  const imageRatio = imageWidth / imageHeight;
  const originRatio = origin.width / origin.height;
  const width =
    originRatio > imageRatio ? origin.height * imageRatio : origin.width;
  const height =
    originRatio > imageRatio ? origin.height : origin.width / imageRatio;

  return {
    // The projected face travels with the rect: the fit only recenters the
    // axis-aligned box, while the quad keeps describing the rendered pose.
    ...origin,
    left: origin.left + (origin.width - width) / 2,
    top: origin.top + (origin.height - height) / 2,
    width,
    height,
  };
}

/** The projected interaction rect covers the whole physical print, so the
 * morph starts from a box with the FRAMED aspect inside it, not the bare
 * image's. Without a registered form the two are the same. */
function projectSceneArtifactPreviewOrigin(id: SceneArtifactId) {
  const artifact = sceneArtifactById(id);
  if (!artifact || artifact.kind !== "image") return null;
  const origin = projectSceneInteractionRect(artifact.interactionId);
  if (!origin) return null;
  const framed = framedArtifactPreviewSize(
    artifactPreviewFrameFor(id) ?? BARE_ARTIFACT_PREVIEW_FRAME,
    artifact,
  );
  return imageRatioPreviewOrigin(origin, framed.width, framed.height);
}

function imageRatioOriginForArtifact(
  id: SceneArtifactId,
  origin: ProjectedSceneInteractionRect,
) {
  const artifact = sceneArtifactById(id);
  if (!artifact || artifact.kind !== "image") return null;
  const framed = framedArtifactPreviewSize(
    artifactPreviewFrameFor(id) ?? BARE_ARTIFACT_PREVIEW_FRAME,
    artifact,
  );
  return imageRatioPreviewOrigin(origin, framed.width, framed.height);
}

/** Stages the selected print's authored/resting projection immediately before
 * the live hover projection opens. Consumed by the next preview session. */
export function stageSceneArtifactPreviewReturnOrigin(
  id: SceneArtifactId,
  origin: ProjectedSceneInteractionRect,
) {
  stagedReturnOrigins.set(id, origin);
}

export function beginSceneArtifactPreviewOriginSession(id: SceneArtifactId) {
  const artifact = sceneArtifactById(id);
  const origins = new Map<SceneArtifactId, ProjectedSceneInteractionRect>();
  const returnOrigins = new Map<
    SceneArtifactId,
    ProjectedSceneInteractionRect
  >();
  if (artifact) {
    for (const entry of sceneArtifactCollection(artifact.id)) {
      const origin = projectSceneArtifactPreviewOrigin(entry.id);
      if (origin) {
        origins.set(entry.id, origin);
        returnOrigins.set(entry.id, origin);
      }
      const staged = stagedReturnOrigins.get(entry.id);
      if (staged) {
        const settled = imageRatioOriginForArtifact(entry.id, staged);
        if (settled) returnOrigins.set(entry.id, settled);
      }
    }
  }
  stagedReturnOrigins.delete(id);
  sceneArtifactPreviewOriginSession = artifact
    ? {
        collection: artifact.collection,
        viewport: currentPreviewViewport(),
        origins,
        returnOrigins,
      }
    : null;
}

export function ensureSceneArtifactPreviewOrigin(id: SceneArtifactId) {
  const session = sceneArtifactPreviewOriginSession;
  const artifact = sceneArtifactById(id);
  if (
    !session ||
    !artifact ||
    artifact.collection !== session.collection ||
    session.origins.has(id)
  )
    return;
  const origin = projectSceneArtifactPreviewOrigin(id);
  if (!origin) return;
  const origins = new Map(session.origins);
  origins.set(id, origin);
  const returnOrigins = new Map(session.returnOrigins);
  returnOrigins.set(id, origin);
  sceneArtifactPreviewOriginSession = { ...session, origins, returnOrigins };
}

function currentHistoryState(): Record<string, unknown> {
  return window.history.state && typeof window.history.state === "object"
    ? (window.history.state as Record<string, unknown>)
    : {};
}

function activateSceneArtifact(id: SceneArtifactId) {
  const artifact = sceneArtifactById(id);
  const state = useStacks.getState();
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!artifact) return;
  state.openSceneArtifact(id, reduceMotion);
}

export function openSceneArtifact(id: SceneArtifactId) {
  const state = useStacks.getState();
  if (state.modalOpen || state.panelState !== "closed") return;
  if (!sceneArtifactById(id)) return;
  beginSceneArtifactPreviewOriginSession(id);
  window.history.pushState(
    { ...currentHistoryState(), [HISTORY_KEY]: id },
    "",
    window.location.href,
  );
  activateSceneArtifact(id);
}

export function restoreSceneArtifact(id: SceneArtifactId) {
  beginSceneArtifactPreviewOriginSession(id);
  activateSceneArtifact(id);
}

export function selectSceneArtifact(id: SceneArtifactId) {
  const state = useStacks.getState();
  if (!state.inspectedArtifact) return;
  ensureSceneArtifactPreviewOrigin(id);
  window.history.replaceState(
    { ...currentHistoryState(), [HISTORY_KEY]: id },
    "",
    window.location.href,
  );
  state.selectImageSceneArtifact(id);
}

export function closeSceneArtifact() {
  const state = useStacks.getState();
  if (!state.inspectedArtifact) return;
  if (sceneArtifactFromHistoryState(window.history.state)) {
    window.history.back();
  } else state.closeSceneArtifact();
}

export function sceneArtifactFromHistoryState(
  state: unknown,
): SceneArtifactId | null {
  if (!state || typeof state !== "object" || !(HISTORY_KEY in state)) {
    return null;
  }
  const value = (state as Record<string, unknown>)[HISTORY_KEY];
  if (typeof value !== "string") return null;
  // An entry written for an artifact that no longer exists (the Homework
  // icon's retired 3D inspector) reads as no artifact, so navigating back
  // onto it closes rather than reopens.
  return sceneArtifactById(value as SceneArtifactId)
    ? (value as SceneArtifactId)
    : null;
}
