"use client";

import { useObjectNote } from "../objectNotes";
import { useArtifactPreviewFrames } from "../scene/artifactPreviewFrames";
import { artifactPreviewVisualEffects } from "../scene/artifactPreviewVisualEffects";
import { destinationFor } from "../scene/interactionRegistry";
import { useModelArtifactRendererEnabled } from "../scene/modelArtifactDiagnostics";
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
  type SceneModelArtifact,
  isSceneImageArtifact,
  sceneArtifactById,
  sceneArtifactCollection,
} from "../sceneArtifacts";
import { useStacks } from "../store";
import { PALETTES, type Palette } from "../theme";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  type CSSProperties,
  Component,
  type ErrorInfo,
  type HTMLAttributes,
  type ReactNode,
  createRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { PhotoSlider } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import type {
  OverlayRenderProps,
  PhotoRenderParams,
  DataType as PhotoSliderItem,
} from "react-photo-view/dist/types";

import { ProgressivePreviewImage } from "./ProgressivePreviewImage";
import {
  type ArtifactPreviewDismissPoint,
  artifactPreviewShouldDismissOnRelease,
} from "./artifactPreviewDismissGesture";
import { fitArtifactPreviewToViewport } from "./artifactPreviewFit";
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
import {
  type ModelArtifactCameraTarget,
  modelArtifactPreviewVisible,
} from "./modelArtifactHandoff";

const ModelArtifactStage = dynamic(() => import("./ModelArtifactStage"), {
  ssr: false,
  loading: () => null,
});

const glassControl =
  "world-glass-control border transition-[background-color,border-color,color,transform] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none";
const ignoreIndexChange = () => undefined;

type PreviewChromeProps = Readonly<{
  artifact: SceneArtifact;
  total: number;
  index: number;
  visible: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}>;

function PreviewChrome({
  artifact,
  total,
  index,
  visible,
  onIndexChange,
  onClose,
}: PreviewChromeProps) {
  const model = artifact.kind === "model";
  // Captions live in content/stacks/objects.md, fetched on first need rather
  // than bundled (see ../objectNotes). An artifact's own `caption` still wins
  // where one is set in the catalog, so nothing already authored moves.
  // Null for anything that cannot show one: the hook fetches the whole notes
  // JSON on first non-null id, and a model or an already-captioned image was
  // paying for a document it discards on the next line.
  const note = useObjectNote(
    artifact.kind === "image" && !artifact.caption ? artifact.id : null,
  );
  const caption =
    artifact.kind === "image" ? (artifact.caption ?? note?.body) : undefined;

  return (
    <div
      data-scene-artifact-inspector
      data-preview-chrome-visible={visible ? "" : undefined}
      className="pointer-events-none fixed inset-0 z-[30] text-white"
    >
      {!model && <h2 className="sr-only">{artifact.title}</h2>}
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${artifact.title} preview`}
        autoFocus={model}
        data-artifact-preview-control="close"
        className={`pointer-events-auto absolute right-[max(14px,env(safe-area-inset-right))] top-[max(14px,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full sm:size-10 ${glassControl}`}
      >
        <XIcon aria-hidden size={21} weight="bold" />
      </button>

      <div
        data-artifact-preview-scrim
        className="absolute inset-x-0 bottom-0 px-[max(16px,env(safe-area-inset-left))] pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5"
      >
        <div
          className={`mx-auto flex max-w-[1500px] flex-col gap-2 ${model ? "sm:items-end" : "sm:flex-row sm:items-center"}`}
        >
          {total > 1 && (
            <div
              data-artifact-preview-control="navigation"
              className={`pointer-events-auto flex self-center rounded-full ${glassControl} sm:self-auto`}
            >
              <button
                type="button"
                onClick={() => onIndexChange(index - 1)}
                disabled={index === 0}
                aria-label="Previous image"
                className="grid size-11 place-items-center rounded-l-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 motion-reduce:transition-none sm:size-10"
              >
                <ArrowLeftIcon aria-hidden size={18} weight="bold" />
              </button>
              <span
                aria-live="polite"
                className="grid min-w-14 place-items-center border-x border-white/10 px-2 font-mono text-[11px] tracking-[0.08em] text-white/70"
              >
                {index + 1} / {total}
              </span>
              <button
                type="button"
                onClick={() => onIndexChange(index + 1)}
                disabled={index === total - 1}
                aria-label="Next image"
                className="grid size-11 place-items-center rounded-r-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 motion-reduce:transition-none sm:size-10"
              >
                <ArrowRightIcon aria-hidden size={18} weight="bold" />
              </button>
            </div>
          )}

          {artifact.kind === "image" && caption && (
            <p
              data-artifact-preview-caption
              className="min-w-0 flex-1 text-center text-sm sm:text-left"
            >
              <span className="inline-block max-w-2xl rounded-xl border border-[#725536]/20 bg-[#f2e7cf]/85 px-4 py-2 text-[#493721]/80 shadow-[0_8px_24px_rgba(22,14,8,0.14)] backdrop-blur-[2px]">
                {caption}
              </span>
            </p>
          )}

          {artifact.kind === "model" && (
            <section
              id={`artifact-description-${artifact.id}`}
              data-artifact-preview-caption
              className="mx-auto w-full max-w-[720px] self-center text-left"
            >
              <h2 className="font-serif text-lg leading-tight text-white sm:text-xl">
                {artifact.title}
              </h2>
              <ul className="mx-auto mt-2 w-fit max-w-full list-disc space-y-1 pl-4 text-left text-[13px] leading-[1.45] text-white/70 sm:text-sm">
                {artifact.description.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {artifact.actions.length > 0 && (
            <div
              data-artifact-preview-control="actions"
              className="pointer-events-auto flex w-fit max-w-full items-center justify-center gap-2 self-center sm:ml-auto sm:self-auto"
            >
              {artifact.actions.map((action) => {
                const target =
                  action.kind === "destination"
                    ? destinationFor(action.to)
                    : { href: action.href, external: true };
                return (
                  <a
                    key={`${artifact.id}:${action.label}`}
                    href={target.href}
                    target={target.external ? "_blank" : undefined}
                    rel={target.external ? "noreferrer" : undefined}
                    className={`inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-5 text-center text-sm font-medium sm:min-h-10 ${glassControl}`}
                  >
                    {action.label}
                    {target.external && (
                      <ArrowUpRightIcon aria-hidden size={15} weight="bold" />
                    )}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImagePreviewOverlay({
  artifact,
  total,
  preview,
}: {
  artifact: SceneArtifact;
  total: number;
  preview: OverlayRenderProps;
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
      visible={preview.overlayVisible}
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
function PreviewPrint({
  attrs,
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

  // Spatial rotation. The viewer can only translate and scale its box, so
  // the roll, yaw, and perspective of the rendered print are restored here:
  // the element opens under the captured pose matrix and eases to identity
  // on the viewer's own clock, and closing eases back onto the pose while
  // the box shrinks home. Layout effect, so the pose is on before the first
  // painted frame.
  useLayoutEffect(() => {
    const node = element.current;
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
        if (animatePose(reversed)) return () => animation?.cancel();
      }
      node.style.transition = `transform ${ARTIFACT_PREVIEW_DURATION_MS}ms ${ARTIFACT_PREVIEW_EASING}`;
      node.style.transform = pose;
      return;
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
      }
    };
  }, [
    closing,
    closingPose,
    closingPoseKeyframes,
    opening,
    openingPose,
    openingPoseKeyframes,
  ]);

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
        position: "relative",
        borderRadius: layout.radius,
        opacity: visible ? style.opacity : 0,
      }}
      data-scene-artifact-preview-image
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
        className="pointer-events-none absolute max-w-none select-none"
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

class ModelStageBoundary extends Component<
  Readonly<{
    children: ReactNode;
    onFailure: () => void;
  }>,
  Readonly<{ failed: boolean }>
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onFailure();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ModelArtifactViewer({
  artifact,
  visible,
  onAfterClose,
}: {
  artifact: SceneModelArtifact;
  visible: boolean;
  onAfterClose: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const rendererEnabled = useModelArtifactRendererEnabled();
  const handoff = useStacks((state) =>
    state.modelArtifactHandoff?.artifactId === artifact.id
      ? state.modelArtifactHandoff
      : null,
  );
  const dispatchHandoff = useStacks(
    (state) => state.dispatchModelArtifactHandoff,
  );
  const [portalReady, setPortalReady] = useState(false);
  const [rendererFailed, setRendererFailed] = useState(false);
  const fallbackImage = useRef<HTMLImageElement>(null);
  const lastTarget = useRef<ModelArtifactCameraTarget | null>(null);

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (!visible) {
      const timeout = window.setTimeout(onAfterClose, 360);
      return () => window.clearTimeout(timeout);
    }
    setRendererFailed(false);
  }, [onAfterClose, visible]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (visible && event.key === "Escape") closeSceneArtifact();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  const reportRendererFailure = useCallback(() => {
    setRendererFailed(true);
  }, []);
  const reportRendererReady = useCallback(
    (target: ModelArtifactCameraTarget) => {
      lastTarget.current = target;
      dispatchHandoff({ type: "preview-ready", target });
    },
    [dispatchHandoff],
  );

  useEffect(() => {
    if (handoff && !handoff.target && lastTarget.current)
      dispatchHandoff({ type: "preview-ready", target: lastTarget.current });
  }, [dispatchHandoff, handoff]);

  if (!portalReady) return null;

  const renderModel = rendererEnabled && !rendererFailed;
  const previewVisible = handoff
    ? modelArtifactPreviewVisible(handoff.phase)
    : false;
  const chromeVisible = handoff?.phase === "inspecting";
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${artifact.title} artifact`}
      aria-describedby={`artifact-description-${artifact.id}`}
      data-model-artifact-viewer
      data-model-artifact-visible={previewVisible ? "" : undefined}
      data-model-artifact-phase={handoff?.phase}
      className="fixed inset-0 z-[2000]"
    >
      <div
        aria-hidden
        data-model-artifact-backdrop
        onClick={closeSceneArtifact}
        className="stacks-artifact-preview-mask absolute inset-0"
      />
      <div
        data-model-artifact-stage-shell
        onClick={renderModel ? undefined : closeSceneArtifact}
        className="absolute inset-x-0 bottom-[clamp(220px,32vh,290px)] top-0 z-10 sm:bottom-[clamp(160px,24vh,220px)]"
      >
        {!renderModel && (
          <Image
            ref={fallbackImage}
            data-model-artifact-fallback
            src={artifact.fallbackImage}
            alt=""
            width={1024}
            height={1024}
            onLoad={() => {
              const bounds = fallbackImage.current?.getBoundingClientRect();
              if (!bounds) return;
              reportRendererReady({
                bounds,
                cameraRelativeQuaternion: [0, 0, 0, 1],
              });
            }}
            className="pointer-events-none absolute left-1/2 top-1/2 max-h-[58%] w-[min(58vw,360px)] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_22px_30px_rgba(0,0,0,0.28)]"
          />
        )}
        {renderModel && (
          <ModelStageBoundary onFailure={reportRendererFailure}>
            <ModelArtifactStage
              dark={resolvedTheme === "dark"}
              interactive={handoff?.phase === "inspecting"}
              onReady={reportRendererReady}
              onBackgroundClick={closeSceneArtifact}
              onRendererFailure={reportRendererFailure}
            />
          </ModelStageBoundary>
        )}
      </div>
      <PreviewChrome
        artifact={artifact}
        total={1}
        index={0}
        visible={chromeVisible}
        onIndexChange={ignoreIndexChange}
        onClose={closeSceneArtifact}
      />
    </div>,
    document.body,
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
  const images = useMemo<PhotoSliderItem[]>(
    () =>
      imageCollection.map((entry) => {
        const origin = projectedOrigins.get(entry.id);
        const returnOrigin = previewOriginsValid
          ? previewOriginSession?.returnOrigins.get(entry.id)
          : undefined;
        const originElement = origin ? originElements.get(entry.id) : undefined;
        const frame = frames.get(entry.id) ?? BARE_ARTIFACT_PREVIEW_FRAME;
        const framed = framedArtifactPreviewSize(frame, entry);
        const fitted = fitArtifactPreviewToViewport(
          framed,
          previewViewport.width > 0
            ? previewViewport
            : { width: framed.width + 48, height: framed.height + 144 },
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
        return {
          key: `${entry.id}:${previewViewport.width}x${previewViewport.height}`,
          ...fitted,
          ...(originElement ? { originRef: originElement } : {}),
          // Supplying `src` makes react-photo-view wait for an image onLoad and
          // abandon its origin transition after 250 ms. The custom renderer
          // keeps its geometry ready immediately while the browser decodes.
          render: ({ attrs }) => (
            <PreviewPrint
              attrs={attrs}
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
      }),
    [
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
    ],
  );

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
    const fitted = fitArtifactPreviewToViewport(
      framedArtifactPreviewSize(
        frames.get(selectedId) ?? BARE_ARTIFACT_PREVIEW_FRAME,
        artifact,
      ),
      previewViewport,
    );
    dispatchHandoff({
      type: "preview-ready",
      target: {
        bounds: {
          left: (previewViewport.width - fitted.width) / 2,
          top: (previewViewport.height - fitted.height) / 2,
          ...fitted,
        },
        ...(sourceBounds ? { sourceBounds } : {}),
        cameraRelativeQuaternion: [0, 0, 0, 1],
      },
    });
  }, [
    artifact,
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
              top: origin.top,
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
            />
          )}
        />
      )}
      {artifact?.kind === "model" && (
        <ModelArtifactViewer
          artifact={artifact}
          visible={selectedId === artifact.id}
          onAfterClose={clearLastSelected}
        />
      )}
    </>
  );
}
