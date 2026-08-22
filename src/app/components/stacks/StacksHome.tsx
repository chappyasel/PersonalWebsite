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

import FlatHome from "./FlatHome";
import { useWorldBoot } from "./boot/useWorldBoot";
import { worldBoot } from "./boot/worldBootSession";
import { type StacksData, type StacksSlots } from "./data";
import ChromeLayer from "./dom/ChromeLayer";
import PlacardLayer from "./dom/PlacardLayer";
import UnitRail from "./dom/UnitRail";
import ScrollBridges from "./input/ScrollBridges";
import StacksBookModal from "./modal/StacksBookModal";
import { scenePerformanceTrace } from "./scene/performanceTrace";

const StacksCanvas = dynamic(() => import("./StacksCanvas"), { ssr: false });

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
          '.placard-scroll, [data-book-modal-shell], input, textarea, [contenteditable="true"]',
        ) ?? null
      );
    };
    let selectionAllowedForGesture = false;
    const clearSelection = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      if (
        selectionAllowedForGesture ||
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
    // begins in a placard or book modal is deliberately left alone.
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
               uses the same authored tilt-shift line as the live scene. */
            html[data-og-capture] .stacks-og-ui { visibility: hidden !important; }
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
          {/* The canvas is allowed to finish behind an opaque curtain. The
              handoff can therefore be choreographed without filtering or
              transforming the world itself — both would turn the placards'
              backdrop filters into the wrong compositing root. */}
          <div aria-hidden className="stacks-world-curtain" />
        </div>
      )}
      {boot.flatMounted && (
        <FlatHome slots={slots} animated={boot.flatAnimated} />
      )}
      {/* Books modal — mounted at the root, outside GrainientBackground's
          [contain:paint] and the world's transforms, so fixed positioning
          resolves to the viewport. */}
      <StacksBookModal bookCount={data.bookStats.total} />
    </>
  );
}
