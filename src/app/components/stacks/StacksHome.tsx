"use client";

// Composition root and mode gate for the homepage 3D scene.
//
// The server document and interactive room share the illustrated design.
// Capability, readiness, recovery, and route cleanup live in ./boot.
import { SceneStartupGate } from "../route-transition-prototype/SceneStartupGate";
import { useRouteTransitionPrototype } from "../route-transition-prototype/store";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import {
  Activity,
  type CSSProperties,
  Component,
  type MouseEvent,
  Profiler,
  type ProfilerOnRenderCallback,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import { type HomepageBootOutcome, captureOnce } from "~/lib/analytics";

import { useWorldBoot } from "./boot/useWorldBoot";
import { WORLD_BOOT_POLICY } from "./boot/worldBootPolicy";
import { worldBoot } from "./boot/worldBootSession";
import { type StacksData, type StacksSlots, UNITS } from "./data";
import PlacardLayer from "./dom/PlacardLayer";
import UnitRail from "./dom/UnitRail";
import VisionRideControls from "./dom/VisionRideControls";
import { usePhotoViewerChrome } from "./dom/usePhotoViewerChrome";
import { recordFieldNoteEvent } from "./fieldNotes/progress";
import IllustratedRoom from "./illustration/IllustratedRoom";
import { RoomChrome } from "./illustration/RoomChrome";
import RoomDocument from "./illustration/RoomDocument";
import "./illustration/illustratedEntrance.css";
import { useIllustratedEntrance } from "./illustration/useIllustratedEntrance";
import RoomNavigation, { navigateRoomLink } from "./input/RoomNavigation";
import ScrollBridges from "./input/ScrollBridges";
import { dimensionTravel } from "./input/dimensionTravel";
import { useRoomDimensionKeys } from "./input/roomDimensions";
import StacksBookModal from "./modal/StacksBookModal";
import { performanceDiagnosticRequested } from "./performanceDiagnosticRequest";
import { RoomActivityContext, useRoomActive } from "./room/ResidentRoomHost";
import { scenePerformanceTrace } from "./scene/performanceTrace";
import { useStacks } from "./store";

const subscribeViewport = (listener: () => void) => {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
};
const getArtworkViewport = () =>
  window.innerWidth < 1200 && window.innerWidth / window.innerHeight <= 0.75
    ? ("phone" as const)
    : ("desktop" as const);
const getServerArtworkViewport = () => "desktop" as const;

const StacksCanvas = dynamic(() => import("./StacksCanvas"), { ssr: false });
const SceneArtifactInspector = dynamic(
  () => import("./modal/SceneArtifactInspector"),
  { ssr: false },
);

const recordPerformanceCommit: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  _startTime,
  commitTime,
) => {
  scenePerformanceTrace.reactCommit({
    at: commitTime,
    id,
    phase,
    durationMs: actualDuration,
    baseDurationMs: baseDuration,
  });
};

/** An explicit support visit records the boot machine's facts. The ten-second
 * checkpoint means the evidence ships while a visitor is still stuck, rather
 * than relying on the gate eventually opening. */
function useAutomaticPerformanceDiagnostic() {
  useEffect(() => {
    // Keep the recorder out of the normal entry bundle. Only an opted-in
    // support visit loads the reporter.
    if (!performanceDiagnosticRequested(window.location.search)) return;

    let disposed = false;
    let stop = () => {
      // The diagnostic chunk has not installed its listeners yet.
    };

    void import("./performanceDiagnostic")
      .then(
        ({
          PERFORMANCE_DIAGNOSTIC_CHECKPOINTS_MS,
          WorldBootDiagnosticRecorder,
          browserPerformanceDiagnosticContext,
          createPerformanceDiagnosticEvent,
          performanceDiagnosticRunId,
          submitPerformanceDiagnostic,
        }) => {
          if (disposed) return;
          const recorder = new WorldBootDiagnosticRecorder();
          let terminalCaptured = false;
          let observedEpoch: number | null = null;
          let checkpoints: number[] = [];
          const publishedCheckpoints = new Set<number>();

          const publish = (
            reportKind:
              | "diagnostic_start"
              | "boot_checkpoint"
              | "boot_complete",
            captureReason:
              | "diagnostic_started"
              | "slow_boot_checkpoint"
              | "boot_terminal"
              | "pagehide",
            checkpointIndex: number | null = null,
          ) => {
            const now = performance.now();
            const state = worldBoot.getState();
            recorder.observe(state, now);
            const bootReport = recorder.snapshot(now);
            const report = {
              boot: bootReport,
              browser: browserPerformanceDiagnosticContext(),
            };
            const event = createPerformanceDiagnosticEvent({
              diagnosticRunId: performanceDiagnosticRunId(state.epoch),
              reportKind,
              captureReason,
              checkpointIndex,
              elapsedMs: bootReport.elapsed_ms,
              bootStatus: state.status,
              bootPath: state.loadPath,
              blockingGate: bootReport.blocking_gate,
              report,
            });
            void submitPerformanceDiagnostic(event);
          };

          const armCheckpoints = (
            state: ReturnType<typeof worldBoot.getState>,
          ) => {
            for (const checkpoint of checkpoints)
              window.clearTimeout(checkpoint);
            checkpoints = [];
            if (state.startedAt === null) return;
            const epoch = state.epoch;
            checkpoints = PERFORMANCE_DIAGNOSTIC_CHECKPOINTS_MS.map(
              (checkpointAt, index) => {
                const checkpointIndex = index + 1;
                const delay = Math.max(
                  0,
                  checkpointAt - (performance.now() - state.startedAt!),
                );
                return window.setTimeout(() => {
                  if (worldBoot.getState().epoch !== epoch) return;
                  if (
                    terminalCaptured ||
                    publishedCheckpoints.has(checkpointIndex)
                  )
                    return;
                  publishedCheckpoints.add(checkpointIndex);
                  publish(
                    "boot_checkpoint",
                    "slow_boot_checkpoint",
                    checkpointIndex,
                  );
                }, delay);
              },
            );
          };

          const observe = () => {
            const state = worldBoot.getState();
            if (state.startedAt !== null && state.epoch !== observedEpoch) {
              observedEpoch = state.epoch;
              terminalCaptured = false;
              publishedCheckpoints.clear();
              publish("diagnostic_start", "diagnostic_started", 0);
              armCheckpoints(state);
            }
            recorder.observe(state, performance.now());
            if (
              !terminalCaptured &&
              (state.status === "revealing" ||
                state.status === "live" ||
                state.status === "failed" ||
                state.status === "ineligible")
            ) {
              terminalCaptured = true;
              for (const checkpoint of checkpoints)
                window.clearTimeout(checkpoint);
              publish("boot_complete", "boot_terminal");
            }
          };

          observe();
          const unsubscribe = worldBoot.subscribe(observe);
          const onPageHide = () => {
            if (terminalCaptured) return;
            publish("boot_checkpoint", "pagehide");
          };
          window.addEventListener("pagehide", onPageHide);
          stop = () => {
            unsubscribe();
            for (const checkpoint of checkpoints)
              window.clearTimeout(checkpoint);
            window.removeEventListener("pagehide", onPageHide);
          };
        },
      )
      .catch(() => {
        // Diagnostics must never interfere with homepage delivery.
      });

    return () => {
      disposed = true;
      stop();
    };
  }, []);
}

/** A chunk that fails to load throws during render, which would blank the
 * page. Catch it and keep the illustrated room available. */
class CanvasBoundary extends Component<
  { onError: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    // Never swallow it. A boundary that silently demotes to the flat page
    // turns any scene-level throw into "the world just doesn't load", which
    // is indistinguishable from a slow network and cost a teammate an
    // afternoon of chasing the wrong thing.
    console.error("[stacks] world failed to mount, falling back:", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function StacksHome({
  data,
  slots,
  illustrated: illustratedEnabled = true,
  initialUnit = 0,
}: {
  data: StacksData;
  slots: StacksSlots;
  illustrated?: boolean;
  initialUnit?: number;
}) {
  const roomActive = useRoomActive();
  const boot = useWorldBoot(illustratedEnabled);
  useAutomaticPerformanceDiagnostic();
  usePhotoViewerChrome();
  useRoomDimensionKeys(roomActive);
  const { epoch, mode, revealed, worldMounted } = boot;
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const viewport = useSyncExternalStore(
    subscribeViewport,
    getArtworkViewport,
    getServerArtworkViewport,
  );
  const presentation = boot.presentation;
  const illustrated = presentation === "illustrated";
  const handoff = presentation === "dissolve" || presentation === "travel";
  const roomMounted = worldMounted || presentation !== "document";
  const contentVisible = illustrated || handoff || revealed;
  const illustrationReady = useCallback(
    (key: string | null, matchRequired = true) => {
      worldBoot.send({ type: "illustrationChanged", key, matchRequired });
    },
    [],
  );
  const illustrationUnavailable = useCallback(() => {
    const view = worldBoot.getView();
    worldBoot.scope(view.epoch).send({
      type: "illustrationUnavailable",
      key: view.illustrationKey,
    });
  }, []);
  const request3D = useCallback(() => worldBoot.request3D(), []);
  const followIllustratedSection = useCallback(
    (event: MouseEvent) => {
      if (
        !illustrated ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const anchor = (event.target as Element).closest?.("a[href]");
      const href = anchor?.getAttribute("href");
      if (!href?.startsWith("#")) return;
      const index = UNITS.findIndex((entry) =>
        [entry.slug, entry.urlSlug, ...(entry.urlAliases ?? [])].includes(
          href.slice(1),
        ),
      );
      if (index < 0) return;
      event.preventDefault();
      navigateRoomLink(index, false);
    },
    [illustrated],
  );
  useLayoutEffect(() => {
    if (!roomActive || !roomMounted || !illustratedEnabled) return;
    // The reader can take over before image decode. Only scene registration
    // waits on the drawing, so a stalled cover cannot cover usable content.
    document.documentElement.dataset.illustratedUi = "ready";
    return () => {
      delete document.documentElement.dataset.illustratedUi;
    };
  }, [roomActive, roomMounted, illustratedEnabled]);
  const settledUnit = useStacks((state) => state.settledUnit);
  const seated = useStacks((state) => state.seated);
  const worldShellRef = useRef<HTMLDivElement>(null);
  const entranceUnit = useStacks((state) => state.activeUnit);
  const entrance = useIllustratedEntrance(
    illustratedEnabled && roomMounted && roomActive,
    worldShellRef,
    `${entranceUnit}:${theme}:${viewport}`,
    presentation === "live",
  );

  // Bound to this boot's generation. The canvas can lose its context or throw
  // while it is being torn down for a route change; without the stamp, that
  // would demote whatever boot happens to be live by the time it lands.
  const scope = useMemo(() => worldBoot.scope(epoch), [epoch]);
  const demote = useCallback(
    () => void scope.send({ type: "runtimeError" }),
    [scope],
  );
  const reportLostContext = useCallback(
    () => void scope.send({ type: "contextLost" }),
    [scope],
  );
  const reportFirstFrame = useCallback(
    () => void scope.send({ type: "firstFrame" }),
    [scope],
  );

  // Nothing is downloading until the component that owns the import renders,
  // and the world only mounts one commit later. Kicking it here overlaps the
  // chunk fetch with the rest of hydration instead of queueing behind it.
  // Read the session rather than `boot`: useWorldBoot starts the boot in its
  // own mount effect, which has already run by the time this one does, but the
  // render that carried `boot` here happened before it.
  useEffect(() => {
    if (!worldBoot.getView().worldMounted) return;
    if (useRouteTransitionPrototype.getState().deferSceneStartup) return;
    void (
      StacksCanvas as unknown as { render?: { preload?: () => void } }
    ).render?.preload?.();
    void (StacksCanvas as unknown as { preload?: () => void }).preload?.();
  }, []);

  useEffect(() => {
    if (boot.status === "ineligible" && boot.ineligibility) {
      captureOnce("homepage:delivery", "homepage_delivery", {
        mode: "flat",
        reason: boot.ineligibility,
      });
      return;
    }

    const durationMs = Math.max(
      0,
      Math.round(performance.now() - (boot.startedAt ?? performance.now())),
    );
    if (boot.revealed) {
      captureOnce("homepage:delivery", "homepage_delivery", {
        mode: "world",
        reason: "world",
      });
      captureOnce("homepage:world-boot", "homepage_world_boot", {
        outcome: "ready",
        duration_ms: durationMs,
        boot_path: boot.loadPath,
      });
      return;
    }

    if (boot.status !== "failed" || !boot.failure) return;
    const outcome: Exclude<HomepageBootOutcome, "ready"> =
      boot.failure === "contextLost"
        ? "context_lost"
        : boot.failure === "runtimeError"
          ? "render_error"
          : "timeout";
    captureOnce("homepage:world-boot", "homepage_world_boot", {
      outcome,
      duration_ms: durationMs,
      boot_path: boot.loadPath,
    });
    captureOnce("homepage:delivery", "homepage_delivery", {
      mode: "flat",
      reason: "runtime_fallback",
    });
    captureOnce(
      "homepage:world-runtime-fallback",
      "homepage_world_runtime_fallback",
      {
        mode: "flat",
        reason: "runtime_fallback",
        cause: outcome,
        duration_ms: durationMs,
      },
    );
  }, [
    boot.failure,
    boot.ineligibility,
    boot.loadPath,
    boot.revealed,
    boot.startedAt,
    boot.status,
  ]);

  useEffect(() => {
    if (!revealed || settledUnit === null) return;
    const section = UNITS[settledUnit]?.slug;
    if (!section) return;
    recordFieldNoteEvent({ type: "unit-arrived", unitIndex: settledUnit });
    captureOnce(`homepage:section:${section}`, "homepage_section_arrived", {
      section,
      delivery_mode: "world",
    });
  }, [revealed, settledUnit]);

  useEffect(() => {
    if (revealed && seated) recordFieldNoteEvent({ type: "seat-entered" });
  }, [revealed, seated]);

  useEffect(() => {
    const world = worldShellRef.current;
    if (!roomActive || mode !== "world" || !world) return;

    const selectableElementFor = (target: EventTarget | Node | null) => {
      const element =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      return (
        element?.closest(
          '.placard-scroll, [data-book-modal-shell], [data-modal-scroller], [data-scene-artifact-inspector], input, textarea, [contenteditable="true"]',
        ) ?? null
      );
    };
    let selectionAllowedForGesture = false;
    const clearSelection = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      // Chrome hides a text field's caret from window.getSelection(): the
      // anchor lands on an ancestor of the input, so the node checks below
      // never match and removeAllRanges() would collapse the field's caret
      // to 0 between keystrokes. A focused editable owns the selection.
      if (
        selectionAllowedForGesture ||
        selectableElementFor(document.activeElement) ||
        selectableElementFor(selection.anchorNode) ||
        selectableElementFor(selection.focusNode)
      )
        return;
      selection.removeAllRanges();
    };
    const preventSelection = (event: Event) => {
      if (selectionAllowedForGesture || selectableElementFor(event.target))
        return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    };

    // WebKit may create the range on a sibling rather than on the canvas that
    // received the gesture. Catch selection at the document boundary and
    // clear anything the engine creates despite the CSS guard. Selection that
    // begins in a placard, the book modal, or an intercepted sheet (the
    // routine and manual documents, an exercise page) is deliberately left
    // alone. The sheet is matched by its scroller: expand removes the
    // data-modal-sheet attribute, the scroller stays.
    document.addEventListener("selectstart", preventSelection, {
      capture: true,
    });
    document.addEventListener("selectionchange", clearSelection);

    // WebKit bug 231161 documents an active touchstart preventDefault as the
    // reliable escape hatch. Limit it to a genuine second tap so native world
    // panning and pinch zoom are untouched on ordinary gestures.
    const DOUBLE_TAP_MS = 400;
    const DOUBLE_TAP_DISTANCE_PX = 44;
    const TAP_SLOP_PX = 10;
    let previousTap: { at: number; x: number; y: number } | null = null;
    let currentTouch: { x: number; y: number; moved: boolean } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      selectionAllowedForGesture = Boolean(selectableElementFor(event.target));
      if (selectionAllowedForGesture) {
        previousTap = null;
        currentTouch = null;
        return;
      }
      if (event.touches.length !== 1) {
        previousTap = null;
        currentTouch = null;
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      const now = performance.now();
      if (
        previousTap &&
        now - previousTap.at <= DOUBLE_TAP_MS &&
        Math.hypot(
          touch.clientX - previousTap.x,
          touch.clientY - previousTap.y,
        ) <= DOUBLE_TAP_DISTANCE_PX
      ) {
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        previousTap = null;
      }
      currentTouch = { x: touch.clientX, y: touch.clientY, moved: false };
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || !currentTouch) return;
      if (
        Math.hypot(
          touch.clientX - currentTouch.x,
          touch.clientY - currentTouch.y,
        ) > TAP_SLOP_PX
      )
        currentTouch.moved = true;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (touch && currentTouch && !currentTouch.moved) {
        previousTap = {
          at: performance.now(),
          x: touch.clientX,
          y: touch.clientY,
        };
      } else {
        previousTap = null;
      }
      currentTouch = null;
    };
    world.addEventListener("touchstart", onTouchStart, { passive: false });
    world.addEventListener("touchmove", onTouchMove, { passive: true });
    world.addEventListener("touchend", onTouchEnd, { passive: true });
    world.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("selectstart", preventSelection, {
        capture: true,
      });
      document.removeEventListener("selectionchange", clearSelection);
      world.removeEventListener("touchstart", onTouchStart);
      world.removeEventListener("touchmove", onTouchMove);
      world.removeEventListener("touchend", onTouchEnd);
      world.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [mode, roomActive]);

  return (
    <>
      {roomMounted && (
        <div
          ref={worldShellRef}
          data-room-presentation={presentation}
          data-room-manual-3d={boot.manual3D ? "" : undefined}
          style={
            {
              "--room-switch-duration": `${WORLD_BOOT_POLICY.flatRetireMs}ms`,
            } as CSSProperties
          }
          data-illustrated-entry={illustratedEnabled ? "" : undefined}
          data-room-entrance={illustratedEnabled ? entrance : undefined}
          data-boot-status={boot.status}
          data-boot-wait={boot.waitStage}
          data-boot-failure={boot.failure ?? undefined}
          data-boot-ineligibility={boot.ineligibility ?? undefined}
          data-boot-held={boot.interactionHeld ? "" : undefined}
          onClickCapture={followIllustratedSection}
          data-load-path={boot.loadPath}
          data-canvas-ready={boot.canvasReady ? "" : undefined}
          data-revealed={contentVisible ? "" : undefined}
          className={`stacks-world-shell fixed inset-0 z-10 ${
            contentVisible ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          {(worldMounted || boot.rendererRetained) && (
            <CanvasBoundary key={epoch} onError={demote}>
              <div
                className="absolute inset-0"
                style={{
                  visibility: boot.canvasVisible ? "visible" : "hidden",
                  pointerEvents: presentation === "live" ? "auto" : "none",
                }}
              >
                <Profiler id="canvas-react" onRender={recordPerformanceCommit}>
                  <SceneStartupGate>
                    <RoomActivityContext.Provider
                      value={!boot.rendererRetained}
                    >
                      <StacksCanvas
                        data={data}
                        onReady={reportFirstFrame}
                        onLost={reportLostContext}
                      />
                    </RoomActivityContext.Provider>
                  </SceneStartupGate>
                </Profiler>
              </div>
            </CanvasBoundary>
          )}
          <style>{`
            /* Keep the desktop chrome's geometry measurable so the capture
               uses the same authored tilt-shift line as the live scene. The
               visitor's own "hide the interface" key (H, dom/chromeKeys)
               blanks the same wrapper the same way. */
            html[data-og-capture] .stacks-og-ui { visibility: hidden !important; }
            /* Hide-all remains instant because it is a screenshot control. */
            html[data-chrome-hidden] .stacks-og-ui,
            html[data-chrome-hidden] .stacks-og-ui * { visibility: hidden !important; }
            /* Modal presentations leave the live room alone. Each part of the
               interface exits toward its nearest edge, then returns in a short
               stagger after the presentation closes. Longhand translate
               composes with the authored transforms used by the rail, sheet,
               and projected labels. data-prop-focus is the same exit for a
               prop brought up to the camera (the Projects Mac): a press
               anywhere puts it back, so nothing needs to stay to say so. */
            .stacks-wordmark,
            .stacks-theme-toggle,
            .stacks-unit-rail-desktop,
            .stacks-unit-rail-mobile {
              opacity: 1;
              translate: 0 0;
              transition:
                opacity 280ms ease-out var(--stacks-chrome-return-delay, 0ms),
                translate 420ms cubic-bezier(0.16, 1, 0.3, 1) var(--stacks-chrome-return-delay, 0ms),
                filter 280ms ease-out var(--stacks-chrome-return-delay, 0ms);
            }
            [data-stacks-portal-label],
            [data-stacks-globe-label] {
              opacity: var(--portal-label-opacity, 0);
              translate: 0 0;
              transition:
                opacity 320ms cubic-bezier(0.16, 1, 0.3, 1),
                transform 210ms cubic-bezier(0.16, 1, 0.3, 1),
                translate 420ms cubic-bezier(0.16, 1, 0.3, 1),
                filter 280ms ease-out;
            }
            [data-stacks-sheet-material],
            [data-stacks-mobile-panel] {
              opacity: 1;
              translate: 0 0;
              transition:
                opacity 280ms ease-out 20ms,
                translate 420ms cubic-bezier(0.16, 1, 0.3, 1) 20ms;
            }
            /* The desktop sidebar keeps its glass and text opaque while it
               slides beyond the edge, just as it does in golf mode. One
               translate owns every hide reason so overlapping overlays
               cannot add a second slide or restart a content fade. */
            [data-stacks-desktop-dock],
            [data-stacks-details-toggle-shell] {
              translate: 0 0;
              transition: translate 360ms cubic-bezier(0.4, 0, 0.2, 1);
            }
            [data-stacks-desktop-dock] {
              --stacks-sidebar-exit: calc(100% + var(--stacks-details-gutter) + 1rem);
            }
            [data-stacks-details-toggle-shell] {
              --stacks-sidebar-exit: calc(100% + 2rem);
            }
            [data-stacks-mobile-panel-dim] {
              transition: opacity 220ms ease-out 20ms;
            }
            .stacks-unit-rail-desktop,
            .stacks-unit-rail-mobile { --stacks-chrome-return-delay: 55ms; }
            .stacks-wordmark { --stacks-chrome-return-delay: 90ms; }
            .stacks-theme-toggle { --stacks-chrome-return-delay: 120ms; }
            .stacks-chrome-vignette {
              opacity: 1;
              transition: opacity 220ms ease-out 20ms;
            }
            html[data-field-notes-open] .stacks-wordmark,
            html[data-overlay-open] .stacks-wordmark,
            html[data-prop-focus] .stacks-wordmark,
            html[data-photo-view] .stacks-wordmark {
              opacity: 0;
              translate: 0 -12px;
              filter: blur(2px);
              transition-delay: 30ms;
              transition-duration: 170ms, 220ms, 170ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1), ease-in;
            }
            html[data-field-notes-open] .stacks-theme-toggle,
            html[data-overlay-open] .stacks-theme-toggle,
            html[data-prop-focus] .stacks-theme-toggle,
            html[data-photo-view] .stacks-theme-toggle {
              opacity: 0;
              translate: 8px -10px;
              filter: blur(2px);
              transition-delay: 45ms;
              transition-duration: 170ms, 220ms, 170ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1), ease-in;
            }
            html[data-field-notes-open] .stacks-unit-rail-desktop,
            html[data-overlay-open] .stacks-unit-rail-desktop,
            html[data-prop-focus] .stacks-unit-rail-desktop,
            html[data-photo-view] .stacks-unit-rail-desktop {
              opacity: 0;
              translate: -22px 0;
              filter: blur(2px);
              transition-delay: 15ms;
              transition-duration: 180ms, 230ms, 180ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1), ease-in;
            }
            html[data-field-notes-open] .stacks-unit-rail-mobile,
            html[data-overlay-open] .stacks-unit-rail-mobile,
            html[data-prop-focus] .stacks-unit-rail-mobile,
            html[data-photo-view] .stacks-unit-rail-mobile {
              opacity: 0;
              translate: 0 -14px;
              filter: blur(2px);
              transition-delay: 15ms;
              transition-duration: 180ms, 230ms, 180ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1), ease-in;
            }
            [data-stacks-desktop-dock][data-retracted],
            [data-stacks-details-toggle-shell][data-retracted],
            html:is([data-field-notes-open], [data-overlay-open], [data-prop-focus], [data-photo-view="open"])
              :is([data-stacks-desktop-dock], [data-stacks-details-toggle-shell]) {
              translate: var(--stacks-sidebar-exit) 0;
            }
            html[data-field-notes-open] [data-stacks-sheet-material],
            html[data-field-notes-open] [data-stacks-mobile-panel],
            html[data-overlay-open] [data-stacks-sheet-material],
            html[data-prop-focus] [data-stacks-sheet-material],
            html[data-overlay-open] [data-stacks-mobile-panel],
            html[data-prop-focus] [data-stacks-mobile-panel],
            html[data-photo-view] [data-stacks-sheet-material],
            html[data-photo-view] [data-stacks-mobile-panel] {
              opacity: 0 !important;
              translate: 0 24px;
              transition-delay: 0ms;
              transition-duration: 180ms, 240ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1);
            }
            html[data-field-notes-open] [data-stacks-mobile-panel-dim],
            html[data-overlay-open] [data-stacks-mobile-panel-dim],
            html[data-prop-focus] [data-stacks-mobile-panel-dim],
            html[data-photo-view] [data-stacks-mobile-panel-dim] {
              opacity: 0 !important;
              transition-delay: 0ms;
              transition-duration: 160ms;
            }
            html[data-field-notes-open] [data-stacks-portal-label],
            html[data-overlay-open] [data-stacks-portal-label],
            html[data-prop-focus] [data-stacks-portal-label],
            html[data-photo-view] [data-stacks-portal-label] {
              opacity: 0;
              translate: 0 8px;
              transition-delay: 0ms;
              transition-duration: 140ms, 180ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1);
            }
            html[data-field-notes-open] .stacks-chrome-vignette,
            html[data-overlay-open] .stacks-chrome-vignette,
            html[data-prop-focus] .stacks-chrome-vignette,
            html[data-photo-view] .stacks-chrome-vignette {
              opacity: 0;
              transition-delay: 0ms;
              transition-duration: 180ms;
            }
            html[data-field-notes-open] .stacks-og-ui,
            html[data-field-notes-open] .stacks-og-ui *,
            html[data-overlay-open] .stacks-og-ui,
            html[data-prop-focus] .stacks-og-ui,
            html[data-overlay-open] .stacks-og-ui *,
            html[data-prop-focus] .stacks-og-ui *,
            html[data-photo-view] .stacks-og-ui,
            html[data-photo-view] .stacks-og-ui * { pointer-events: none !important; }
            /* The one piece of chrome that belongs to the near prop: its
               caption's links (dom/PropCaption.tsx) must take the click the
               blanket rule above would swallow. */
            html[data-prop-focus] .stacks-og-ui [data-prop-caption-visible] a { pointer-events: auto !important; }
            @media (width < 768px) {
              /* Field Notes keeps the room mounted and hands it to the paper
                 progressively. Its material is already visible while these
                 supporting controls recede; PhotoView keeps its existing
                 faster suppression. */
              html[data-field-notes-open] .stacks-wordmark,
              html[data-field-notes-open] .stacks-theme-toggle,
              html[data-field-notes-open] .stacks-unit-rail-mobile {
                transition-delay: 0ms;
                transition-duration: 260ms, 300ms, 240ms;
                transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1), ease-out;
              }
              html[data-field-notes-open] [data-stacks-sheet-material],
              html[data-field-notes-open] [data-stacks-mobile-panel] {
                transition-delay: 0ms;
                transition-duration: 280ms, 320ms;
                transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1);
              }
              html[data-field-notes-open] [data-stacks-mobile-panel-dim],
              html[data-field-notes-open] .stacks-chrome-vignette {
                transition-delay: 0ms;
                transition-duration: 260ms;
                transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
              }
              html[data-field-notes-open] [data-stacks-portal-label] {
                transition-delay: 0ms;
                transition-duration: 220ms, 260ms;
                transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1);
              }
            }
            @media (width >= 1200px) {
              html[data-field-notes-open] .stacks-theme-toggle,
              html[data-overlay-open] .stacks-theme-toggle,
              html[data-prop-focus] .stacks-theme-toggle,
              html[data-photo-view] .stacks-theme-toggle {
                translate: -10px 10px;
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .stacks-wordmark,
              .stacks-theme-toggle,
              .stacks-unit-rail-desktop,
              .stacks-unit-rail-mobile,
              [data-stacks-desktop-dock],
              [data-stacks-details-toggle-shell],
              [data-stacks-sheet-material],
              [data-stacks-mobile-panel],
              [data-stacks-mobile-panel-dim],
              [data-stacks-portal-label],
              [data-stacks-globe-label],
              .stacks-chrome-vignette {
                transition-duration: 1ms !important;
                transition-delay: 0ms !important;
              }
              html[data-field-notes-open] .stacks-wordmark,
              html[data-field-notes-open] .stacks-theme-toggle,
              html[data-field-notes-open] .stacks-unit-rail-desktop,
              html[data-field-notes-open] .stacks-unit-rail-mobile,
              html[data-field-notes-open] [data-stacks-sheet-material],
              html[data-field-notes-open] [data-stacks-mobile-panel],
              html[data-field-notes-open] [data-stacks-portal-label],
              html[data-overlay-open] .stacks-wordmark,
              html[data-prop-focus] .stacks-wordmark,
              html[data-overlay-open] .stacks-theme-toggle,
              html[data-prop-focus] .stacks-theme-toggle,
              html[data-overlay-open] .stacks-unit-rail-desktop,
              html[data-prop-focus] .stacks-unit-rail-desktop,
              html[data-overlay-open] .stacks-unit-rail-mobile,
              html[data-prop-focus] .stacks-unit-rail-mobile,
              html[data-overlay-open] [data-stacks-sheet-material],
              html[data-prop-focus] [data-stacks-sheet-material],
              html[data-overlay-open] [data-stacks-mobile-panel],
              html[data-prop-focus] [data-stacks-mobile-panel],
              html[data-overlay-open] [data-stacks-portal-label],
              html[data-prop-focus] [data-stacks-portal-label],
              html[data-photo-view] .stacks-wordmark,
              html[data-photo-view] .stacks-theme-toggle,
              html[data-photo-view] .stacks-unit-rail-desktop,
              html[data-photo-view] .stacks-unit-rail-mobile,
              html[data-photo-view] [data-stacks-sheet-material],
              html[data-photo-view] [data-stacks-mobile-panel],
              html[data-photo-view] [data-stacks-portal-label] {
                translate: 0 0;
                filter: none;
              }
            }
            html[data-og-capture] .stacks-world-curtain,
            html[data-og-capture] .stacks-boot,
            html[data-og-capture] .room-document { display: none !important; }
          `}</style>
          <Activity mode={roomActive ? "visible" : "hidden"}>
            <RoomNavigation rendererEnabled={presentation === "live"}>
              {presentation !== "document" &&
                worldBoot.getState().illustratedMode && (
                  <IllustratedRoom
                    data={data}
                    theme={theme}
                    viewport={viewport}
                    visible={illustrated || handoff}
                    navigationEnabled={
                      boot.status !== "flattening" && !boot.manual3D
                    }
                    transitionPosition={
                      boot.interactionHeld ||
                      boot.status === "flattening" ||
                      boot.manual3D
                        ? dimensionTravel.position
                        : null
                    }
                    transitionId={dimensionTravel.revision}
                    canRequest3D={boot.canRequest3D && !boot.interactionHeld}
                    loading={
                      boot.status === "booting" ||
                      boot.recoverable
                    }
                    entranceSettled={entrance === "complete"}
                    onRequest3D={request3D}
                    onReady={illustrationReady}
                    onUnavailable={illustrationUnavailable}
                  />
                )}
              <div className="stacks-og-ui contents">
                <RoomChrome
                  illustrated={illustratedEnabled}
                  live={presentation === "live"}
                  keepControls={boot.interactionHeld}
                >
                  <UnitRail />
                </RoomChrome>
                <Profiler id="placard" onRender={recordPerformanceCommit}>
                  <PlacardLayer
                    data={data}
                    slots={slots}
                    sceneRevealed={contentVisible}
                  />
                </Profiler>
                {presentation === "live" && <ScrollBridges />}
              </div>
              {presentation === "live" && <VisionRideControls />}
            </RoomNavigation>
          </Activity>
          {/* The canvas is allowed to finish behind an opaque curtain. The
              handoff can therefore be choreographed without filtering or
              transforming the world itself — both would turn the placards'
              backdrop filters into the wrong compositing root. */}
          <div aria-hidden className="stacks-world-curtain" />
        </div>
      )}
      <Activity mode={roomActive ? "visible" : "hidden"}>
        {presentation === "document" && (
          <RoomDocument data={data} slots={slots} initialUnit={initialUnit} />
        )}
        {/* Books modal — mounted at the root, outside the world's transforms, so fixed positioning
          resolves to the viewport. */}
        <StacksBookModal bookCount={data.bookStats.total} />
        <SceneArtifactInspector />
      </Activity>
    </>
  );
}
