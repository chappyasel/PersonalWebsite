import {
  type ImagePreviewSize,
  fitImagePreview,
} from "~/components/images/imagePreviewFit";

export {
  fitImagePreview as fitArtifactPreviewToViewport,
  type ImagePreviewSize as ArtifactPreviewSize,
} from "~/components/images/imagePreviewFit";

/** Measured heights of the viewer chrome, in CSS pixels. `captionHeight` is
 * the caption's natural (unclipped) height, 0 when there is no caption;
 * `controlsHeight` is the bottom dock including its padding. */
export type ArtifactPreviewChrome = Readonly<{
  captionHeight: number;
  controlsHeight: number;
}>;

/** Breathing room above the image and between the caption and the dock. */
const STAGE_EDGE = 16;
/** Gap between the image and its caption. */
const CAPTION_GAP = 16;
/** The caption may take at most this share of the stage; past it, it
 * scrolls. */
const CAPTION_SHARE = 0.3;

/** The stage is the viewport minus the bottom dock, with an edge above and
 * below. The image and its caption are one block centred in it.
 *
 * react-photo-view always centres its photo layer in the full window, so
 * the inspector shifts that layer by `offsetY` to centre the block in the
 * stage instead. The shift depends only on the chrome, never on the image,
 * so every image in the collection shares it. */
export function artifactPreviewStage(
  viewport: ImagePreviewSize,
  chrome: ArtifactPreviewChrome,
) {
  const available = Math.max(
    1,
    viewport.height - chrome.controlsHeight - STAGE_EDGE * 2,
  );
  const captionHeight = Math.min(
    chrome.captionHeight,
    available * CAPTION_SHARE,
  );
  const captionGap = captionHeight > 0 ? CAPTION_GAP : 0;
  return {
    edge: STAGE_EDGE,
    available,
    captionHeight,
    captionGap,
    offsetY: -(chrome.controlsHeight + captionHeight + captionGap) / 2,
  };
}

/** Fit the image and its measured caption above the independent bottom
 * dock. `top` and `captionTop` are viewport positions; `offsetY` is the
 * photo-layer shift from `artifactPreviewStage`. */
export function layoutArtifactPreview(
  image: ImagePreviewSize,
  viewport: ImagePreviewSize,
  chrome: ArtifactPreviewChrome,
) {
  const stage = artifactPreviewStage(viewport, chrome);
  const fitted = fitImagePreview(
    image,
    {
      width: viewport.width,
      height: Math.max(
        1,
        stage.available - stage.captionHeight - stage.captionGap,
      ),
    },
    { verticalInset: 0 },
  );
  const top =
    stage.edge +
    (stage.available - fitted.height - stage.captionHeight - stage.captionGap) /
      2;
  return {
    ...fitted,
    top,
    offsetY: stage.offsetY,
    captionTop: top + fitted.height + stage.captionGap,
    captionHeight: stage.captionHeight,
  };
}
