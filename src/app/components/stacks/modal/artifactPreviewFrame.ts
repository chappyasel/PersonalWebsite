import type { ArtifactPreviewSize } from "./artifactPreviewFit";

/** A print's edge tone: one of the scene palette's print materials, or a
 * literal colour for the few cards that do not take their paper from the
 * palette (the training figure cards). */
export type ArtifactPreviewFrameTone =
  | "paper"
  | "pages"
  | "frame"
  | `#${string}`;

/** One physical layer around the photo, measured in scene units from the
 * image edge outward. Layers are uniform on all four sides because every
 * framed print in the room is: FlatPrint's paper, DeskFrame's mat and
 * frame, the corkboard mounts, PortraitFrame's mat and frame. */
export type ArtifactPreviewFrameLayer = Readonly<{
  /** Distance from the image edge to this layer's outer edge. */
  inset: number;
  tone: ArtifactPreviewFrameTone;
  /** Corner radius of this layer's outer edge. */
  radius: number;
  /** Surface treatment used by the DOM preview. The scene's material still
   * owns its real lighting; this keeps metal and carved gilt from becoming
   * paper-textured flat fills after the handoff. */
  finish?: "paper" | "wood" | "metal" | "gilt";
}>;

export type ArtifactPreviewFrameAccent =
  | Readonly<{
      kind: "corner-blocks";
      tone: ArtifactPreviewFrameTone;
      size: number;
      /** Distance from each outer edge to the block's centre. */
      edgeInset: number;
      radius: number;
    }>
  | Readonly<{
      kind: "eyelets";
      tone: ArtifactPreviewFrameTone;
      radius: number;
      stroke: number;
      /** Eyelet centres as a fraction of the framed width. */
      spread: number;
    }>;

/** The physical form a scene photo takes, as the fullscreen preview needs
 * it: the image plane's scene size plus its edge layers, inner to outer.
 * Scene units scale to pixels through the image width, so a 0.024 frame on
 * a 0.18-wide print stays proportionally heavier than on a 0.72-wide one. */
export type ArtifactPreviewFrame = Readonly<{
  image: ArtifactPreviewSize;
  layers: readonly ArtifactPreviewFrameLayer[];
  accents?: readonly ArtifactPreviewFrameAccent[];
  /** Exact role-sized URL painted on the scene plane. It stays under the
   * fullscreen master so decode timing cannot alter the geometry handoff. */
  previewSrc?: string;
}>;

/** No edges: the preview is the bare image. Used when a photo has not
 * registered a physical form. */
export const BARE_ARTIFACT_PREVIEW_FRAME: ArtifactPreviewFrame = Object.freeze({
  image: Object.freeze({ width: 1, height: 1 }),
  layers: Object.freeze([]),
});

export function artifactPreviewFrameOuterInset(frame: ArtifactPreviewFrame) {
  return frame.layers.reduce((max, layer) => Math.max(max, layer.inset), 0);
}

/** Pixels per scene unit for a print whose framed box is `framedWidth` wide. */
function pixelsPerSceneUnit(frame: ArtifactPreviewFrame, framedWidth: number) {
  const sceneWidth =
    frame.image.width + 2 * artifactPreviewFrameOuterInset(frame);
  return sceneWidth > 0 ? framedWidth / sceneWidth : 0;
}

/** The framed print's size with the image at its native pixel size. This is
 * what the viewport fit and the origin morph must measure, because the
 * projected scene bounds describe the framed object, not the bare photo. */
export function framedArtifactPreviewSize(
  frame: ArtifactPreviewFrame,
  image: ArtifactPreviewSize,
): ArtifactPreviewSize {
  const outer = artifactPreviewFrameOuterInset(frame);
  if (outer <= 0 || frame.image.width <= 0) return image;
  const border = outer * (image.width / frame.image.width);
  return { width: image.width + 2 * border, height: image.height + 2 * border };
}

export type ArtifactPreviewFrameLayerLayout = Readonly<{
  /** Distance in pixels from the framed box edge to this layer's edge. */
  offset: number;
  radius: number;
  tone: ArtifactPreviewFrameTone;
  finish?: ArtifactPreviewFrameLayer["finish"];
}>;

export type ArtifactPreviewFrameAccentLayout =
  | Readonly<{
      kind: "eyelets";
      tone: ArtifactPreviewFrameTone;
      radius: number;
      stroke: number;
      spread: number;
    }>
  | Readonly<{
      kind: "corner-blocks";
      tone: ArtifactPreviewFrameTone;
      size: number;
      edgeInset: number;
      radius: number;
    }>;

export type ArtifactPreviewFrameLayout = Readonly<{
  /** Inset of the image from the framed box edge, in pixels. */
  imageInset: number;
  /** Outer corner radius of the whole print, in pixels. */
  radius: number;
  /** Outer to inner, ready to paint back to front. */
  layers: readonly ArtifactPreviewFrameLayerLayout[];
  accents: readonly ArtifactPreviewFrameAccentLayout[];
}>;

/** Lay the frame out inside a framed box `framedWidth` pixels wide. Only the
 * width matters: the viewer animates the box height separately while it
 * morphs from the scene's aspect, and the edges must follow the width. */
export function artifactPreviewFrameLayout(
  frame: ArtifactPreviewFrame,
  framedWidth: number,
): ArtifactPreviewFrameLayout {
  const outer = artifactPreviewFrameOuterInset(frame);
  const scale = pixelsPerSceneUnit(frame, framedWidth);
  const layers = [...frame.layers]
    .sort((a, b) => b.inset - a.inset)
    .map((layer) => ({
      offset: (outer - layer.inset) * scale,
      radius: layer.radius * scale,
      tone: layer.tone,
      finish: layer.finish,
    }));
  const accents = (frame.accents ?? []).map((accent) =>
    accent.kind === "corner-blocks"
      ? {
          ...accent,
          size: accent.size * scale,
          edgeInset: accent.edgeInset * scale,
          radius: accent.radius * scale,
        }
      : {
          ...accent,
          radius: accent.radius * scale,
          stroke: accent.stroke * scale,
        },
  );
  return {
    imageInset: outer * scale,
    radius: layers[0]?.radius ?? 0,
    layers,
    accents,
  };
}

export function resolveArtifactPreviewFrameTone(
  tone: ArtifactPreviewFrameTone,
  palette: Readonly<{ paper: string; pages: string; frame: string }>,
): string {
  return tone === "paper" || tone === "pages" || tone === "frame"
    ? palette[tone]
    : tone;
}
