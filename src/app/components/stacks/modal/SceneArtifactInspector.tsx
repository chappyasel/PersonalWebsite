"use client";

import { useObjectNote } from "../objectNotes";
import { useArtifactPreviewFrames } from "../scene/artifactPreviewFrames";
import { artifactPreviewVisualEffects } from "../scene/artifactPreviewVisualEffects";
import { destinationFor } from "../scene/interactionRegistry";
import {
  closeSceneArtifact,
  readSceneArtifactPreviewOriginSession,
  restoreSceneArtifact,
  sceneArtifactFromHistoryState,
  sceneArtifactPreviewOriginSessionMatchesViewport,
  selectSceneArtifact,
} from "../sceneArtifactState";
import {
  SCENE_ARTIFACTS,
  type SceneArtifact,
  type SceneArtifactId,
  isSceneImageArtifact,
  sceneArtifactById,
  sceneArtifactCollection,
} from "../sceneArtifacts";
import { useStacks } from "../store";
import { PALETTES, type Palette } from "../theme";
import { useTheme } from "next-themes";
import {
  type CSSProperties,
  type HTMLAttributes,
  createRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PhotoSlider } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import type {
  OverlayRenderProps,
  PhotoRenderParams,
  DataType as PhotoSliderItem,
} from "react-photo-view/dist/types";

import { ImageViewerChrome } from "~/components/images/ImageViewerChrome";

import { ProgressivePreviewImage } from "./ProgressivePreviewImage";
import {
  type ArtifactPreviewDismissPoint,
  artifactPreviewShouldDismissOnRelease,
} from "./artifactPreviewDismissGesture";
import {
  type ArtifactPreviewChrome,
  type ArtifactPreviewSize,
  artifactPreviewStage,
  layoutArtifactPreview,
} from "./artifactPreviewFit";
import {
  type ArtifactPreviewFrame,
  type ArtifactPreviewFrameAccentLayout,
  BARE_ARTIFACT_PREVIEW_FRAME,
  artifactPreviewFrameLayout,
  framedArtifactPreviewSize,
  resolveArtifactPreviewFrameTone,
} from "./artifactPreviewFrame";
import {
  ARTIFACT_PREVIEW_DURATION_MS,
  ARTIFACT_PREVIEW_EASING,
  artifactPreviewDuration,
  artifactPreviewEasing,
} from "./artifactPreviewMotion";
import {
  type ArtifactPreviewPoseKeyframe,
  artifactPreviewPoseKeyframes,
  artifactPreviewPoseTransform,
} from "./artifactPreviewPose";
import { modelArtifactPreviewVisible } from "./modelArtifactHandoff";

/** The photo layer is centred in the window by react-photo-view; this
 * custom property moves it into the image-and-caption stage. It lives on the
 * root element because the origin `<img>`s (in this tree) and the viewer's
 * `.PhotoView__PhotoWrap` (portalled to body) both read it, and because it
 * must be written synchronously from the chrome's layout effect: the viewer
 * measures the origin rectangle in a passive effect of the same commit, so a
 * React re-render would arrive too late for the opening morph. */
const STAGE_OFFSET_PROPERTY = "--stacks-preview-stage-offset";

function writeStageOffset(offsetY: number) {
  document.documentElement.style.setProperty(
    STAGE_OFFSET_PROPERTY,
    `${Math.round(offsetY)}px`,
  );
}

/* The wrap's `transform` is inline (the slider's x travel); `translate`
 * composes with it. The shift only animates once the viewer has settled
 * (see `data-scene-artifact-preview-settled`), never on the frame the
 * origin is measured. */
const STAGE_STYLE = `
  .stacks-artifact-preview--staged .PhotoView__PhotoWrap {
    translate: 0 var(${STAGE_OFFSET_PROPERTY}, 0px);
  }
  .stacks-artifact-preview--staged .PhotoView__PhotoWrap:has([data-scene-artifact-preview-settled]) {
    transition: translate ${ARTIFACT_PREVIEW_DURATION_MS}ms ${ARTIFACT_PREVIEW_EASING};
  }
  @media (prefers-reduced-motion: reduce) {
    .stacks-artifact-preview--staged .PhotoView__PhotoWrap:has([data-scene-artifact-preview-settled]) {
      transition: none;
    }
  }
`;

function PreviewChrome({
  artifact,
  total,
  index,
  visible,
  contentTop,
  captionMaxHeight,
  onMeasure,
  onIndexChange,
  onClose,
}: {
  artifact: SceneArtifact;
  total: number;
  index: number;
  visible: boolean;
  contentTop: number;
  captionMaxHeight: number;
  onMeasure: (measurement: ArtifactPreviewChrome) => void;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const note = useObjectNote(artifact.id);
  const caption =
    note?.visitor && note.status === "written" ? note.body : undefined;
  return (
    <ImageViewerChrome
      title={artifact.title}
      caption={caption}
      captionId={`artifact-caption-${artifact.id}`}
      contentTop={contentTop}
      captionMaxHeight={captionMaxHeight}
      onMeasure={onMeasure}
      total={total}
      index={index}
      visible={visible}
      onIndexChange={onIndexChange}
      onClose={onClose}
      actions={artifact.actions.map((action) => ({
        ...(action.kind === "destination"
          ? destinationFor(action.to)
          : { href: action.href, external: true }),
        label: action.label,
      }))}
    />
  );
}

function ImagePreviewOverlay({
  artifact,
  total,
  preview,
  contentTop,
  captionMaxHeight,
  onMeasure,
}: {
  artifact: SceneArtifact;
  total: number;
  preview: OverlayRenderProps;
  contentTop: number;
  captionMaxHeight: number;
  onMeasure: (measurement: ArtifactPreviewChrome) => void;
}) {
  const gesture = useRef<{
    pointerId: number;
    points: ArtifactPreviewDismissPoint[];
  } | null>(null);
  const scale = useRef(preview.scale);
  const close = useRef(preview.onClose);
  scale.current = preview.scale;
  close.current = preview.onClose;

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        !(event.target instanceof Element) ||
        !event.target.closest("[data-scene-artifact-preview-image]")
      ) {
        gesture.current = null;
        return;
      }
      gesture.current = {
        pointerId: event.pointerId,
        points: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }],
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      const current = gesture.current;
      if (current?.pointerId !== event.pointerId) return;
      current.points.push({
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      });
    };
    const finishPointer = (event: PointerEvent) => {
      const current = gesture.current;
      gesture.current = null;
      if (current?.pointerId !== event.pointerId) return;
      current.points.push({
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      });
      if (artifactPreviewShouldDismissOnRelease(current.points, scale.current))
        close.current();
    };
    const cancelPointer = () => {
      gesture.current = null;
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", finishPointer, true);
    window.addEventListener("pointercancel", cancelPointer, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", finishPointer, true);
      window.removeEventListener("pointercancel", cancelPointer, true);
    };
  }, []);

  return (
    <PreviewChrome
      artifact={artifact}
      total={total}
      index={preview.index}
      visible={preview.overlayVisible && preview.visible}
      contentTop={contentTop}
      captionMaxHeight={captionMaxHeight}
      onMeasure={onMeasure}
      onIndexChange={preview.onIndexChange}
      onClose={preview.onClose}
    />
  );
}

function pixelLength(value: CSSProperties["width"]) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

type PreviewPrintProps = Readonly<{
  attrs: PhotoRenderParams["attrs"];
  size: ArtifactPreviewSize;
  /** The viewer's live zoom factor for this box (`PhotoRenderParams.scale`). */
  scale: number;
  frame: ArtifactPreviewFrame;
  palette: Palette;
  src: string;
  previewSrc: string;
  visible: boolean;
  opening: boolean;
  closing: boolean;
  /** matrix3d putting this element over the print's rendered pose while the
   * viewer sits in its start box; null when no pose was captured. */
  openingPose: string | null;
  closingPose: string | null;
  /** Projected-corner homographies from the captured camera pose to flat. */
  openingPoseKeyframes: readonly ArtifactPreviewPoseKeyframe[] | null;
  closingPoseKeyframes: readonly ArtifactPreviewPoseKeyframe[] | null;
}>;

function reducedMotionPreferred() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function PreviewFrameAccents({
  accents,
  palette,
}: {
  accents: readonly ArtifactPreviewFrameAccentLayout[];
  palette: Palette;
}) {
  return accents.flatMap((accent, accentIndex) => {
    const color = resolveArtifactPreviewFrameTone(accent.tone, palette);
    if (accent.kind === "eyelets")
      return [-1, 1].map((side) => (
        <div
          key={`${accentIndex}:eyelet:${side}`}
          aria-hidden
          data-scene-artifact-preview-accent="eyelet"
          className="pointer-events-none absolute box-border rounded-full"
          style={{
            left: `${50 + side * accent.spread * 50}%`,
            top: accent.radius,
            width: accent.radius * 2,
            height: accent.radius * 2,
            borderColor: color,
            borderWidth: accent.stroke,
            transform: "translate(-50%, -50%)",
          }}
        />
      ));

    return [-1, 1].flatMap((xSide) =>
      [-1, 1].map((ySide) => (
        <div
          key={`${accentIndex}:block:${xSide}:${ySide}`}
          aria-hidden
          data-scene-artifact-preview-accent="corner-block"
          className="pointer-events-none absolute"
          style={{
            left:
              xSide < 0
                ? accent.edgeInset
                : `calc(100% - ${accent.edgeInset}px)`,
            top:
              ySide < 0
                ? accent.edgeInset
                : `calc(100% - ${accent.edgeInset}px)`,
            width: accent.size,
            height: accent.size,
            borderRadius: accent.radius,
            backgroundColor: color,
            transform: "translate(-50%, -50%)",
          }}
        />
      )),
    );
  });
}

/** The enlarged photo drawn as the print it is in the room: the image inside
 * the same paper, mat, or frame the scene built around it, so the morph out
 * of the shelf never sheds its edges on the way up.
 *
 * The viewer hands over its box as `attrs` (size, opacity, transitions, the
 * drag handlers). The edges are laid out from that box's WIDTH alone because
 * the viewer animates height separately while it morphs from the scene's
 * aspect, and the edges must stay proportional to the print, not the box. */
export function PreviewPrint({
  attrs,
  size,
  scale,
  frame,
  palette,
  src,
  previewSrc,
  visible,
  opening,
  closing,
  openingPose,
  closingPose,
  openingPoseKeyframes,
  closingPoseKeyframes,
}: PreviewPrintProps) {
  const element = useRef<HTMLDivElement>(null);
  const style = attrs.style ?? {};
  const layout = artifactPreviewFrameLayout(frame, pixelLength(style.width));
  const imageSize = `calc(100% - ${layout.imageInset * 2}px)`;

  // The viewer's resting mode (react-photo-view 1.2.7 `easingMode === 4`)
  // is the only one whose box transition carries `height 0ms`; opening and
  // closing morph the height on their own clock. At rest the viewer eases
  // the box's position but snaps its size, so when the caption arrives or
  // changes and the image re-fits, the print would jump in size and then
  // drift into place. Ease width and height on the viewer's clock instead.
  // Only at natural zoom, though: a zoom settles by swapping box size for
  // transform scale in one render, and that swap must stay instantaneous.
  const settled =
    typeof style.transition === "string" &&
    style.transition.includes("height 0ms");
  const lastScale = useRef(scale);
  useEffect(() => {
    lastScale.current = scale;
  });
  const easeSize =
    settled &&
    scale === 1 &&
    lastScale.current === 1 &&
    !reducedMotionPreferred();

  // Measurements and frame registrations rebuild the pose arrays during a
  // flight. Keep the latest geometry for the next phase without restarting
  // this phase against a viewer box that has already moved and enlarged.
  const poses = useRef({
    openingPose,
    closingPose,
    openingPoseKeyframes,
    closingPoseKeyframes,
  });
  useLayoutEffect(() => {
    poses.current = {
      openingPose,
      closingPose,
      openingPoseKeyframes,
      closingPoseKeyframes,
    };
  }, [openingPose, closingPose, openingPoseKeyframes, closingPoseKeyframes]);

  // Spatial rotation. The viewer can only translate and scale its box, so
  // the roll, yaw, and perspective of the rendered print are restored here:
  // the element opens under the captured pose matrix and eases to identity
  // on the viewer's own clock, and closing eases back onto the pose while
  // the box shrinks home. Layout effect, so the pose is on before the first
  // painted frame.
  useLayoutEffect(() => {
    const node = element.current;
    const {
      openingPose,
      closingPose,
      openingPoseKeyframes,
      closingPoseKeyframes,
    } = poses.current;
    const pose = closing ? closingPose : openingPose;
    const poseKeyframes = closing ? closingPoseKeyframes : openingPoseKeyframes;
    if (!node || !pose || reducedMotionPreferred()) return;
    if (!opening && !closing) return;
    node.style.transformOrigin = "0 0";
    let animation: Animation | null = null;
    const animatePose = (frames: readonly ArtifactPreviewPoseKeyframe[]) => {
      if (typeof node.animate !== "function") return false;
      animation = node.animate([...frames], {
        duration: ARTIFACT_PREVIEW_DURATION_MS,
        easing: ARTIFACT_PREVIEW_EASING,
        fill: "forwards",
      });
      return true;
    };
    if (closing) {
      node.style.transition = "none";
      node.style.transform = "";
      if (poseKeyframes) {
        const reversed = [...poseKeyframes]
          .reverse()
          .map((frame, index, frames) => ({
            transform: frame.transform,
            offset: index / (frames.length - 1),
          }));
        if (animatePose(reversed))
          return () => {
            node.style.transform = "";
            animation?.cancel();
          };
      }
      node.style.transition = `transform ${ARTIFACT_PREVIEW_DURATION_MS}ms ${ARTIFACT_PREVIEW_EASING}`;
      node.style.transform = pose;
      return () => {
        node.style.transform = "";
      };
    }
    node.style.transition = "none";
    node.style.transform = pose;
    let release = 0;
    const settle = requestAnimationFrame(() => {
      release = requestAnimationFrame(() => {
        if (poseKeyframes && animatePose(poseKeyframes)) return;
        node.style.transition = `transform ${ARTIFACT_PREVIEW_DURATION_MS}ms ${ARTIFACT_PREVIEW_EASING}`;
        node.style.transform = "";
      });
    });
    return () => {
      cancelAnimationFrame(settle);
      cancelAnimationFrame(release);
      if (animation) {
        // WAAPI sits above the inline start pose while it runs. Commit the
        // flush endpoint before canceling it, or removing the finished
        // animation exposes `pose` again for one settled frame.
        node.style.transform = "";
        animation.cancel();
      } else {
        node.style.transform = "";
      }
    };
  }, [closing, opening]);

  return (
    <div
      ref={element}
      {...(attrs as HTMLAttributes<HTMLDivElement>)}
      className={[
        "PhotoView__Photo",
        "stacks-artifact-preview-print",
        attrs.className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...style,
        // The homography already maps the full photo onto its shelf quad.
        // react-photo-view also morphs height to the origin's bounding aspect;
        // applying both would squash the photo twice, on different clocks.
        ...(openingPose || closingPose
          ? { height: pixelLength(style.width) * (size.height / size.width) }
          : {}),
        ...(easeSize
          ? {
              transition: `${style.transition}, width ${ARTIFACT_PREVIEW_DURATION_MS}ms ${ARTIFACT_PREVIEW_EASING}, height ${ARTIFACT_PREVIEW_DURATION_MS}ms ${ARTIFACT_PREVIEW_EASING}`,
            }
          : {}),
        position: "relative",
        borderRadius: layout.radius,
        opacity: visible ? style.opacity : 0,
      }}
      data-scene-artifact-preview-image
      data-scene-artifact-preview-settled={settled ? "" : undefined}
      data-scene-artifact-preview-opening={opening ? "" : undefined}
      data-scene-artifact-preview-closing={closing ? "" : undefined}
    >
      {layout.layers.map((layer, index) => (
        <div
          key={index}
          aria-hidden
          data-scene-artifact-preview-edge={layer.tone}
          data-scene-artifact-preview-edge-finish={layer.finish}
          className="pointer-events-none absolute"
          style={{
            inset: layer.offset,
            borderRadius: layer.radius,
            backgroundColor: resolveArtifactPreviewFrameTone(
              layer.tone,
              palette,
            ),
          }}
        />
      ))}
      <ProgressivePreviewImage
        previewSrc={previewSrc}
        detailSrc={src}
        opening={opening}
        dismissing={closing}
        className="absolute max-w-none"
        style={{
          left: layout.imageInset,
          top: layout.imageInset,
          width: imageSize,
          height: imageSize,
          objectFit: "contain",
        }}
      />
      {layout.layers.length > 0 && (
        <div
          aria-hidden
          data-scene-artifact-preview-well
          className="pointer-events-none absolute"
          style={{ inset: layout.imageInset }}
        />
      )}
      <PreviewFrameAccents accents={layout.accents} palette={palette} />
    </div>
  );
}

export default function SceneArtifactInspector() {
  const selectedId = useStacks((state) => state.inspectedArtifact);
  const artifactHandoffPhase = useStacks(
    (state) => state.modelArtifactHandoff?.phase ?? null,
  );
  const dispatchHandoff = useStacks(
    (state) => state.dispatchModelArtifactHandoff,
  );
  const finishArtifactClose = useStacks(
    (state) => state.finishSceneArtifactClose,
  );
  const [lastSelectedId, setLastSelectedId] = useState(selectedId);
  const [previewViewport, setPreviewViewport] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const visualEffects = useSyncExternalStore(
    artifactPreviewVisualEffects.subscribe,
    artifactPreviewVisualEffects.getSnapshot,
    () => artifactPreviewVisualEffects.defaultSnapshot,
  );
  const clearLastSelected = useCallback(() => {
    setLastSelectedId(null);
    finishArtifactClose();
  }, [finishArtifactClose]);
  const originElements = useMemo(
    () =>
      new Map(
        SCENE_ARTIFACTS.filter(isSceneImageArtifact).map(
          (entry) =>
            [
              entry.id,
              createRef<HTMLImageElement>(),
            ] as const satisfies readonly [
              SceneArtifactId,
              ReturnType<typeof createRef<HTMLImageElement>>,
            ],
        ),
      ),
    [],
  );

  const displayId = selectedId ?? lastSelectedId;
  const artifact = sceneArtifactById(displayId);
  const collection = useMemo(
    () => (artifact ? sceneArtifactCollection(artifact.id) : []),
    [artifact],
  );
  const imageCollection = useMemo(
    () => collection.filter(isSceneImageArtifact),
    [collection],
  );
  // The chrome measures itself (caption and dock heights) in a layout
  // effect and reports here. State drives React geometry; the custom
  // property is written in the same call so the origin rectangle the viewer
  // is about to measure already reflects the new stage.
  const [chromeMeasurement, setChromeMeasurement] =
    useState<ArtifactPreviewChrome>({ captionHeight: 0, controlsHeight: 124 });
  const measureChrome = useCallback((next: ArtifactPreviewChrome) => {
    writeStageOffset(
      artifactPreviewStage(
        { width: window.innerWidth, height: window.innerHeight },
        next,
      ).offsetY,
    );
    setChromeMeasurement((previous) =>
      previous.captionHeight === next.captionHeight &&
      previous.controlsHeight === next.controlsHeight
        ? previous
        : next,
    );
  }, []);
  const stage = artifactPreviewStage(previewViewport, chromeMeasurement);
  useLayoutEffect(() => {
    writeStageOffset(stage.offsetY);
  }, [stage.offsetY]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(STAGE_OFFSET_PROPERTY);
    },
    [],
  );
  const previewOriginSession = readSceneArtifactPreviewOriginSession();
  const previewOriginsValid = sceneArtifactPreviewOriginSessionMatchesViewport(
    previewOriginSession,
    previewViewport,
  );
  const projectedOrigins = useMemo(
    () =>
      previewOriginsValid
        ? previewOriginSession!.origins
        : new Map<SceneArtifactId, never>(),
    [previewOriginSession, previewOriginsValid],
  );
  const position = artifact
    ? imageCollection.findIndex((entry) => entry.id === artifact.id)
    : -1;
  const imagePreviewVisible =
    Boolean(selectedId) ||
    artifactHandoffPhase === null ||
    modelArtifactPreviewVisible(artifactHandoffPhase);
  const imagePreviewOpening = Boolean(
    selectedId && artifactHandoffPhase && artifactHandoffPhase !== "inspecting",
  );
  const imagePreviewClosing = !selectedId;
  // Each photo's physical form registers its edges from the scene.
  const frames = useArtifactPreviewFrames();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const palette = PALETTES[dark ? "dark" : "light"];
  const { images, captionTops } = useMemo(() => {
    const captionTops: number[] = [];
    const images = imageCollection.map<PhotoSliderItem>((entry) => {
      const origin = projectedOrigins.get(entry.id);
      const returnOrigin = previewOriginsValid
        ? previewOriginSession?.returnOrigins.get(entry.id)
        : undefined;
      const originElement = origin ? originElements.get(entry.id) : undefined;
      const frame = frames.get(entry.id) ?? BARE_ARTIFACT_PREVIEW_FRAME;
      const framed = framedArtifactPreviewSize(frame, entry);
      const fitted = layoutArtifactPreview(
        framed,
        previewViewport.width > 0
          ? previewViewport
          : { width: framed.width + 48, height: framed.height + 144 },
        chromeMeasurement,
      );
      const openingPose = origin?.quad
        ? artifactPreviewPoseTransform(fitted, origin, origin.quad)
        : null;
      const openingPoseKeyframes = origin?.quad
        ? artifactPreviewPoseKeyframes(fitted, origin, origin.quad)
        : null;
      const closingPose = origin?.quad
        ? artifactPreviewPoseTransform(
            fitted,
            origin,
            returnOrigin?.quad ?? origin.quad,
          )
        : null;
      const closingPoseKeyframes = origin?.quad
        ? artifactPreviewPoseKeyframes(
            fitted,
            origin,
            returnOrigin?.quad ?? origin.quad,
          )
        : null;
      captionTops.push(fitted.captionTop);
      return {
        key: `${entry.id}:${previewViewport.width}x${previewViewport.height}`,
        width: fitted.width,
        height: fitted.height,
        ...(originElement ? { originRef: originElement } : {}),
        // Supplying `src` makes react-photo-view wait for an image onLoad and
        // abandon its origin transition after 250 ms. The custom renderer
        // keeps its geometry ready immediately while the browser decodes.
        render: ({ attrs, scale }) => (
          <PreviewPrint
            attrs={attrs}
            size={fitted}
            scale={scale}
            frame={frame}
            palette={palette}
            src={entry.image}
            previewSrc={frame.previewSrc ?? entry.previewImage ?? entry.image}
            visible={imagePreviewVisible}
            opening={imagePreviewOpening}
            closing={imagePreviewClosing}
            openingPose={openingPose}
            closingPose={closingPose}
            openingPoseKeyframes={openingPoseKeyframes}
            closingPoseKeyframes={closingPoseKeyframes}
          />
        ),
      };
    });
    return { images, captionTops };
  }, [
    chromeMeasurement,
    frames,
    imageCollection,
    imagePreviewOpening,
    imagePreviewClosing,
    imagePreviewVisible,
    originElements,
    palette,
    previewViewport,
    previewOriginSession,
    previewOriginsValid,
    projectedOrigins,
  ]);

  useEffect(() => {
    const measure = () =>
      setPreviewViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (selectedId) setLastSelectedId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || artifact?.kind !== "image" || previewViewport.width <= 0)
      return;
    const sourceBounds = previewOriginsValid
      ? previewOriginSession?.origins.get(selectedId)
      : undefined;
    // Framed, like the origin: the scene scales the real print by the ratio
    // of these two boxes, and both must measure the same object.
    const fitted = layoutArtifactPreview(
      framedArtifactPreviewSize(
        frames.get(selectedId) ?? BARE_ARTIFACT_PREVIEW_FRAME,
        artifact,
      ),
      previewViewport,
      chromeMeasurement,
    );
    dispatchHandoff({
      type: "preview-ready",
      target: {
        bounds: {
          left: (previewViewport.width - fitted.width) / 2,
          top: fitted.top,
          width: fitted.width,
          height: fitted.height,
        },
        ...(sourceBounds ? { sourceBounds } : {}),
        cameraRelativeQuaternion: [0, 0, 0, 1],
      },
    });
  }, [
    artifact,
    chromeMeasurement,
    dispatchHandoff,
    frames,
    previewOriginSession,
    previewOriginsValid,
    previewViewport,
    selectedId,
  ]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const id = sceneArtifactFromHistoryState(event.state);
      if (id) {
        restoreSceneArtifact(id);
      } else closeSceneArtifact();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <>
      <style>{STAGE_STYLE}</style>
      {imageCollection.map((entry) => {
        const origin = projectedOrigins.get(entry.id);
        const originElement = originElements.get(entry.id);
        return origin && originElement ? (
          // React Photo View preserves aspect ratio during its origin morph
          // only when the origin is an image with object-fit metadata.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={entry.id}
            ref={originElement}
            aria-hidden
            alt=""
            draggable={false}
            data-scene-artifact-preview-origin={entry.id}
            className="pointer-events-none fixed z-[-1] opacity-0"
            style={{
              left: origin.left,
              // The viewer centres in the full window and its photo layer
              // is shifted into the stage by the same custom property, so
              // compensating here keeps the opening and closing on the shelf
              // whatever the stage is when the viewer measures this box.
              top: `calc(${origin.top}px - var(${STAGE_OFFSET_PROPERTY}, 0px))`,
              width: origin.width,
              height: origin.height,
              objectFit: "contain",
            }}
          />
        ) : null;
      })}
      {artifact?.kind === "image" && (
        <PhotoSlider
          images={images}
          index={Math.max(0, position)}
          visible={Boolean(selectedId && artifact)}
          onIndexChange={(nextIndex) => {
            const next = imageCollection[nextIndex];
            if (next && next.id !== selectedId) selectSceneArtifact(next.id);
          }}
          onClose={closeSceneArtifact}
          afterClose={clearLastSelected}
          loop={false}
          speed={artifactPreviewDuration}
          easing={artifactPreviewEasing}
          maskOpacity={null}
          photoClosable={false}
          pullClosable={false}
          bannerVisible={false}
          className={[
            "stacks-artifact-preview",
            "stacks-artifact-preview--staged",
            imagePreviewVisible
              ? "stacks-artifact-preview--handoff-visible"
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
          maskClassName={`stacks-artifact-preview-mask stacks-photo-preview-mask${
            visualEffects.backdropBlur
              ? " stacks-photo-preview-mask--blurred"
              : ""
          }`}
          overlayRender={(props) => (
            <ImagePreviewOverlay
              artifact={artifact}
              total={imageCollection.length}
              preview={props}
              captionMaxHeight={stage.captionHeight}
              onMeasure={measureChrome}
              contentTop={captionTops[props.index] ?? stage.edge}
            />
          )}
        />
      )}
    </>
  );
}
