"use client";

// Composition root and mode gate for the homepage 3D scene.
//
// Server render and the first client render are always the flat page (no
// hydration mismatch). What changed in v5 is that the flat page is no longer
// what you SEE while the world loads: a pre-paint script in page.tsx sets
// data-world="pending" on <html> when the browser can run the world, CSS
// hides the flat document and reveals BootScreen during that first paint, and
// this component takes the attribute over the moment it is alive.
//
// The whole of that policy — capability, warm cache, the four reveal gates,
// the hang backstop, demotion, and route cleanup — lives in ./boot as one
// state machine. What is left here is the seam: signals in, view out.
import dynamic from "next/dynamic";
import {
  Component,
  Profiler,
  type ProfilerOnRenderCallback,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { type HomepageBootOutcome, captureOnce } from "~/lib/analytics";

import FlatHome from "./FlatHome";
import { useWorldBoot } from "./boot/useWorldBoot";
import { worldBoot } from "./boot/worldBootSession";
import { type StacksData, type StacksSlots, UNITS } from "./data";
import ChromeLayer from "./dom/ChromeLayer";
import PlacardLayer from "./dom/PlacardLayer";
import UnitRail from "./dom/UnitRail";
import VisionRideControls from "./dom/VisionRideControls";
import { recordFieldNoteEvent } from "./fieldNotes/progress";
import ScrollBridges from "./input/ScrollBridges";
import StacksBookModal from "./modal/StacksBookModal";
import { scenePerformanceTrace } from "./scene/performanceTrace";
import { useStacks } from "./store";

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

/** A chunk that fails to load throws during render, which would blank the
 * page. Catch it and fall back to the document — that IS the fallback. */
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
}: {
  data: StacksData;
  slots: StacksSlots;
}) {
  const boot = useWorldBoot();
  const { epoch, mode, revealed, worldMounted } = boot;
  const settledUnit = useStacks((state) => state.settledUnit);
  const seated = useStacks((state) => state.seated);
  const worldShellRef = useRef<HTMLDivElement>(null);

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
    if (mode !== "world" || !world) return;

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
  }, [mode]);

  return (
    <>
      {worldMounted && (
        <div
          ref={worldShellRef}
          data-load-path={boot.loadPath}
          data-canvas-ready={boot.canvasReady ? "" : undefined}
          data-revealed={revealed ? "" : undefined}
          className={`stacks-world-shell fixed inset-0 z-10 ${
            revealed ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <CanvasBoundary onError={demote}>
            <Profiler id="canvas-react" onRender={recordPerformanceCommit}>
              <StacksCanvas
                data={data}
                onReady={reportFirstFrame}
                onLost={reportLostContext}
              />
            </Profiler>
          </CanvasBoundary>
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
               and projected labels. */
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
            [data-stacks-portal-label] {
              opacity: var(--portal-label-opacity, 0);
              translate: 0 0;
              transition:
                opacity 320ms cubic-bezier(0.16, 1, 0.3, 1),
                transform 210ms cubic-bezier(0.16, 1, 0.3, 1),
                translate 420ms cubic-bezier(0.16, 1, 0.3, 1),
                filter 280ms ease-out;
            }
            [data-stacks-desktop-dock],
            [data-stacks-details-toggle-shell],
            [data-stacks-sheet-material],
            [data-stacks-mobile-panel] {
              opacity: 1;
              translate: 0 0;
              transition:
                opacity 280ms ease-out 20ms,
                translate 420ms cubic-bezier(0.16, 1, 0.3, 1) 20ms;
            }
            [data-stacks-desktop-dock] {
              transition:
                opacity 280ms ease-out 20ms,
                translate 420ms cubic-bezier(0.16, 1, 0.3, 1) 20ms,
                transform 200ms ease;
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
            html:has(.PhotoView-Portal) .stacks-wordmark {
              opacity: 0;
              translate: 0 -12px;
              filter: blur(2px);
              transition-delay: 30ms;
              transition-duration: 170ms, 220ms, 170ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1), ease-in;
            }
            html[data-field-notes-open] .stacks-theme-toggle,
            html[data-overlay-open] .stacks-theme-toggle,
            html:has(.PhotoView-Portal) .stacks-theme-toggle {
              opacity: 0;
              translate: 8px -10px;
              filter: blur(2px);
              transition-delay: 45ms;
              transition-duration: 170ms, 220ms, 170ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1), ease-in;
            }
            html[data-field-notes-open] .stacks-unit-rail-desktop,
            html[data-overlay-open] .stacks-unit-rail-desktop,
            html:has(.PhotoView-Portal) .stacks-unit-rail-desktop {
              opacity: 0;
              translate: -22px 0;
              filter: blur(2px);
              transition-delay: 15ms;
              transition-duration: 180ms, 230ms, 180ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1), ease-in;
            }
            html[data-field-notes-open] .stacks-unit-rail-mobile,
            html[data-overlay-open] .stacks-unit-rail-mobile,
            html:has(.PhotoView-Portal) .stacks-unit-rail-mobile {
              opacity: 0;
              translate: 0 -14px;
              filter: blur(2px);
              transition-delay: 15ms;
              transition-duration: 180ms, 230ms, 180ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1), ease-in;
            }
            html[data-field-notes-open] [data-stacks-desktop-dock],
            html[data-field-notes-open] [data-stacks-details-toggle-shell],
            html[data-overlay-open] [data-stacks-desktop-dock],
            html[data-overlay-open] [data-stacks-details-toggle-shell],
            html:has(.PhotoView-Portal) [data-stacks-desktop-dock],
            html:has(.PhotoView-Portal) [data-stacks-details-toggle-shell] {
              opacity: 0;
              translate: 26px 0;
              transition-delay: 0ms;
              transition-duration: 180ms, 240ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1);
            }
            html[data-field-notes-open] [data-stacks-sheet-material],
            html[data-field-notes-open] [data-stacks-mobile-panel],
            html[data-overlay-open] [data-stacks-sheet-material],
            html[data-overlay-open] [data-stacks-mobile-panel],
            html:has(.PhotoView-Portal) [data-stacks-sheet-material],
            html:has(.PhotoView-Portal) [data-stacks-mobile-panel] {
              opacity: 0 !important;
              translate: 0 24px;
              transition-delay: 0ms;
              transition-duration: 180ms, 240ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1);
            }
            html[data-field-notes-open] [data-stacks-mobile-panel-dim],
            html[data-overlay-open] [data-stacks-mobile-panel-dim],
            html:has(.PhotoView-Portal) [data-stacks-mobile-panel-dim] {
              opacity: 0 !important;
              transition-delay: 0ms;
              transition-duration: 160ms;
            }
            html[data-field-notes-open] [data-stacks-portal-label],
            html[data-overlay-open] [data-stacks-portal-label],
            html:has(.PhotoView-Portal) [data-stacks-portal-label] {
              opacity: 0;
              translate: 0 8px;
              transition-delay: 0ms;
              transition-duration: 140ms, 180ms;
              transition-timing-function: ease-in, cubic-bezier(0.4, 0, 1, 1);
            }
            html[data-field-notes-open] .stacks-chrome-vignette,
            html[data-overlay-open] .stacks-chrome-vignette,
            html:has(.PhotoView-Portal) .stacks-chrome-vignette {
              opacity: 0;
              transition-delay: 0ms;
              transition-duration: 180ms;
            }
            html[data-field-notes-open] .stacks-og-ui,
            html[data-field-notes-open] .stacks-og-ui *,
            html[data-overlay-open] .stacks-og-ui,
            html[data-overlay-open] .stacks-og-ui *,
            html:has(.PhotoView-Portal) .stacks-og-ui,
            html:has(.PhotoView-Portal) .stacks-og-ui * { pointer-events: none !important; }
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
              html:has(.PhotoView-Portal) .stacks-theme-toggle {
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
              .stacks-chrome-vignette {
                transition-duration: 1ms !important;
                transition-delay: 0ms !important;
              }
              html[data-field-notes-open] .stacks-wordmark,
              html[data-field-notes-open] .stacks-theme-toggle,
              html[data-field-notes-open] .stacks-unit-rail-desktop,
              html[data-field-notes-open] .stacks-unit-rail-mobile,
              html[data-field-notes-open] [data-stacks-desktop-dock],
              html[data-field-notes-open] [data-stacks-details-toggle-shell],
              html[data-field-notes-open] [data-stacks-sheet-material],
              html[data-field-notes-open] [data-stacks-mobile-panel],
              html[data-field-notes-open] [data-stacks-portal-label],
              html[data-overlay-open] .stacks-wordmark,
              html[data-overlay-open] .stacks-theme-toggle,
              html[data-overlay-open] .stacks-unit-rail-desktop,
              html[data-overlay-open] .stacks-unit-rail-mobile,
              html[data-overlay-open] [data-stacks-desktop-dock],
              html[data-overlay-open] [data-stacks-details-toggle-shell],
              html[data-overlay-open] [data-stacks-sheet-material],
              html[data-overlay-open] [data-stacks-mobile-panel],
              html[data-overlay-open] [data-stacks-portal-label],
              html:has(.PhotoView-Portal) .stacks-wordmark,
              html:has(.PhotoView-Portal) .stacks-theme-toggle,
              html:has(.PhotoView-Portal) .stacks-unit-rail-desktop,
              html:has(.PhotoView-Portal) .stacks-unit-rail-mobile,
              html:has(.PhotoView-Portal) [data-stacks-desktop-dock],
              html:has(.PhotoView-Portal) [data-stacks-details-toggle-shell],
              html:has(.PhotoView-Portal) [data-stacks-sheet-material],
              html:has(.PhotoView-Portal) [data-stacks-mobile-panel],
              html:has(.PhotoView-Portal) [data-stacks-portal-label] {
                translate: 0 0;
                filter: none;
              }
            }
            html[data-og-capture] .stacks-world-curtain,
            html[data-og-capture] .stacks-boot,
            html[data-og-capture] .stacks-flat { display: none !important; }
          `}</style>
          <div className="stacks-og-ui contents">
            <UnitRail />
            <ChromeLayer />
            <Profiler id="placard" onRender={recordPerformanceCommit}>
              <PlacardLayer
                data={data}
                slots={slots}
                sceneRevealed={revealed}
              />
            </Profiler>
            <ScrollBridges />
          </div>
          <VisionRideControls />
          {/* The canvas is allowed to finish behind an opaque curtain. The
              handoff can therefore be choreographed without filtering or
              transforming the world itself — both would turn the placards'
              backdrop filters into the wrong compositing root. */}
          <div aria-hidden className="stacks-world-curtain" />
        </div>
      )}
      {boot.flatMounted && (
        <FlatHome
          slots={slots}
          animated={boot.flatAnimated}
          journeyActive={
            boot.status === "ineligible" || boot.status === "failed"
          }
        />
      )}
      {/* Books modal — mounted at the root, outside GrainientBackground's
          [contain:paint] and the world's transforms, so fixed positioning
          resolves to the viewport. */}
      <StacksBookModal bookCount={data.bookStats.total} />
      <SceneArtifactInspector />
    </>
  );
}
