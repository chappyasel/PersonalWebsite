"use client";

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
  Component,
  type ErrorInfo,
  type ImgHTMLAttributes,
  type ReactNode,
  createRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PhotoSlider } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import type { DataType as PhotoSliderItem } from "react-photo-view/dist/types";

import { fitArtifactPreviewToViewport } from "./artifactPreviewFit";
import {
  artifactPreviewDuration,
  artifactPreviewEasing,
} from "./artifactPreviewMotion";
import {
  type ModelArtifactCameraTarget,
  modelArtifactPreviewVisible,
} from "./modelArtifactHandoff";

const ModelArtifactStage = dynamic(() => import("./ModelArtifactStage"), {
  ssr: false,
  loading: () => null,
});

const glassControl =
  "border border-white/20 bg-white/[0.12] text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-[background-color,border-color,color,transform] hover:border-white/30 hover:bg-white/[0.18] hover:text-white active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none";
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
        className="dark:from-[#090b0f]/92 absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#17130f]/90 via-[#211b14]/55 to-transparent px-[max(16px,env(safe-area-inset-left))] pb-[max(16px,env(safe-area-inset-bottom))] pt-16 dark:via-[#10131a]/55 sm:px-6 sm:pb-5"
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

          {artifact.kind === "image" && artifact.caption && (
            <p
              data-artifact-preview-caption
              className="min-w-0 flex-1 text-center text-sm text-white/60 sm:text-left"
            >
              {artifact.caption}
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
    artifactHandoffPhase === null ||
    modelArtifactPreviewVisible(artifactHandoffPhase);
  const imagePreviewOpening = Boolean(
    selectedId && artifactHandoffPhase && artifactHandoffPhase !== "inspecting",
  );
  const images = useMemo<PhotoSliderItem[]>(
    () =>
      imageCollection.map((entry) => {
        const originElement = projectedOrigins.has(entry.id)
          ? originElements.get(entry.id)
          : undefined;
        return {
          key: `${entry.id}:${previewViewport.width}x${previewViewport.height}`,
          ...fitArtifactPreviewToViewport(
            { width: entry.width, height: entry.height },
            previewViewport.width > 0
              ? previewViewport
              : { width: entry.width + 48, height: entry.height + 144 },
          ),
          ...(originElement ? { originRef: originElement } : {}),
          // Supplying `src` makes react-photo-view wait for an image onLoad and
          // abandon its origin transition after 250 ms. The custom renderer
          // keeps its geometry ready immediately while the browser decodes.
          render: ({ attrs }) => (
            // This must reuse the exact URL already decoded for the Three.js
            // texture. Next/Image would introduce a second lazy optimized URL,
            // making the pixels arrive after the morph instead of during it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...(attrs as ImgHTMLAttributes<HTMLImageElement>)}
              className={["PhotoView__Photo", attrs.className]
                .filter(Boolean)
                .join(" ")}
              style={{
                ...attrs.style,
                objectFit: "contain",
                opacity: imagePreviewVisible ? attrs.style?.opacity : 0,
              }}
              src={entry.image}
              alt=""
              draggable={false}
              loading="eager"
              decoding="sync"
              data-scene-artifact-preview-image
              data-scene-artifact-preview-opening={
                imagePreviewOpening ? "" : undefined
              }
              data-scene-artifact-preview-closing={selectedId ? undefined : ""}
            />
          ),
        };
      }),
    [
      imageCollection,
      imagePreviewOpening,
      imagePreviewVisible,
      originElements,
      previewViewport,
      projectedOrigins,
      selectedId,
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
    const fitted = fitArtifactPreviewToViewport(
      { width: artifact.width, height: artifact.height },
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
          maskClassName="stacks-artifact-preview-mask"
          overlayRender={(props) => (
            <PreviewChrome
              artifact={artifact}
              total={imageCollection.length}
              index={props.index}
              visible={props.overlayVisible}
              onIndexChange={props.onIndexChange}
              onClose={props.onClose}
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
