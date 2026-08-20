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
// The old rig demoted to flat on a twelve-second wall clock. That punished
// exactly the wrong people — a slow connection is not a broken one, and the
// visitor who waited longest got the consolation page. Demotion is now driven
// by real failure signals (the chunk refusing to load, the context refusing to
// create, the context being lost) with a long backstop for a genuine hang.
import dynamic from "next/dynamic";
import {
  Component,
  Profiler,
  type ProfilerOnRenderCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import FlatHome from "./FlatHome";
import { type StacksData, type StacksSlots } from "./data";
import ChromeLayer from "./dom/ChromeLayer";
import PlacardLayer from "./dom/PlacardLayer";
import UnitRail from "./dom/UnitRail";
import ScrollBridges from "./input/ScrollBridges";
import TouchInteractionLayer from "./input/TouchInteractionLayer";
import {
  areBootBookFacesReady,
  canRevealWorld,
  isAssetLoadReady,
  isBootSequenceReady,
  isMeadowReady,
  isWarmBoot,
  rememberWarmBoot,
  resetAssetLoadReady,
  resetMeadowReady,
  setLoadProgress,
  setWorldPhase,
} from "./loading";
import StacksBookModal from "./modal/StacksBookModal";
import { scenePerformanceTrace } from "./scene/performanceTrace";
import { useStacks } from "./store";
import { browserCanUseStacksWorld } from "./webglProbe";

const StacksCanvas = dynamic(() => import("./StacksCanvas"), { ssr: false });

/** Long enough that no real network trips it, short enough that a genuinely
 * wedged tab still gets a readable page. */
const HANG_BACKSTOP_MS = 40000;
/** A brief idle window closes the gap between one loading-manager batch
 * completing and a Suspense child queuing the next one. */
const ASSET_SETTLE_MS = 250;

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

type WindowWithStacksBoot = Window & {
  __stacksWorldBootTimer?: number;
  __stacksWorldBootToken?: number;
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
  const mode = useStacks((s) => s.mode);
  const setMode = useStacks((s) => s.setMode);
  const [worldReady, setWorldReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [flatGone, setFlatGone] = useState(false);
  const [bootPath, setBootPath] = useState<"cold" | "warm">("cold");
  const worldShellRef = useRef<HTMLDivElement>(null);

  const demote = useCallback(() => {
    setWorldPhase(null);
    setMode("flat");
  }, [setMode]);

  useEffect(() => {
    if (!browserCanUseStacksWorld()) {
      setWorldPhase(null);
      setMode("flat");
      return;
    }
    resetAssetLoadReady();
    resetMeadowReady();
    // Agrees with the pre-paint script, and also covers the case where the
    // script never ran (a bfcache restore, an extension stripping inline
    // scripts) — the boot screen still comes up rather than the document.
    // A warm phase is carried through rather than overwritten: writing
    // "pending" here would slam the loading animation on screen at hydration,
    // which is precisely the thing the warm path exists to avoid.
    const warm = isWarmBoot();
    setBootPath(warm ? "warm" : "cold");
    setWorldPhase(warm ? "warm" : "pending");
    setMode("world");
  }, [setMode]);

  // `data-world` is a pre-paint handshake, not route state. Clear it when
  // this homepage unmounts so SPA navigation cannot carry the world's
  // overscroll lock onto /books, /manual, or another document route.
  useEffect(() => {
    const bootWindow = window as WindowWithStacksBoot;
    const captureMode = new URLSearchParams(window.location.search).has(
      "og-capture",
    );
    document.documentElement.toggleAttribute("data-og-capture", captureMode);
    const retirePrepaintBackstop = () => {
      if (bootWindow.__stacksWorldBootTimer) {
        window.clearTimeout(bootWindow.__stacksWorldBootTimer);
        bootWindow.__stacksWorldBootTimer = 0;
      }
      bootWindow.__stacksWorldBootToken =
        (bootWindow.__stacksWorldBootToken ?? 0) + 1;
    };
    // React owns failure recovery from this point (CanvasBoundary plus the
    // longer hang backstop), so the parse-time timer must not survive this
    // boot and later clear a newer SPA visit's attribute.
    retirePrepaintBackstop();
    return () => {
      retirePrepaintBackstop();
      setWorldPhase(null);
      setMode("flat");
      document.documentElement.removeAttribute("data-og-capture");
    };
  }, [setMode]);

  // Nothing is downloading until the component that owns the import renders,
  // and `mode` only flips one tick later. Kicking it here overlaps the chunk
  // fetch with the rest of hydration instead of queueing behind it.
  useEffect(() => {
    if (!browserCanUseStacksWorld()) return;
    void (
      StacksCanvas as unknown as { render?: { preload?: () => void } }
    ).render?.preload?.();
    void (StacksCanvas as unknown as { preload?: () => void }).preload?.();
  }, []);

  // Hold the boot screen until a frame has painted, all requested assets have
  // loaded and stayed idle briefly, the meadow buffers exist, and the boot
  // vignette has completed its first pass. Time is never treated as scene
  // readiness. The hang backstop below chooses the flat page instead of
  // exposing an unfinished room when an asset genuinely wedges.
  useEffect(() => {
    if (!worldReady || revealed) return;
    const check = () => {
      if (
        canRevealWorld({
          assetsReady: isAssetLoadReady(performance.now(), ASSET_SETTLE_MS),
          bootBookFacesReady: areBootBookFacesReady(),
          meadowReady: isMeadowReady(),
          bootSequenceReady: isBootSequenceReady(),
        })
      ) {
        setRevealed(true);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    let raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [worldReady, revealed]);

  useEffect(() => {
    if (!revealed) return;
    setWorldPhase("ready");
    // The world got here. The next load can use the shorter cached-world
    // transition, while still painting this loader immediately.
    rememberWarmBoot();
    // Normalize the published progress after the fully-ready handoff. The
    // value is only presentation state now; readiness comes from the live
    // loading-manager state above.
    setLoadProgress(1);
    const timeout = setTimeout(() => setFlatGone(true), 420);
    return () => clearTimeout(timeout);
  }, [revealed]);

  useEffect(() => {
    if (mode !== "world" || revealed) return;
    if (document.documentElement.hasAttribute("data-og-capture")) return;
    const timeout = setTimeout(demote, HANG_BACKSTOP_MS);
    return () => clearTimeout(timeout);
  }, [mode, revealed, demote]);

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
      {mode === "world" && (
        <div
          ref={worldShellRef}
          data-load-path={bootPath}
          data-canvas-ready={worldReady ? "" : undefined}
          data-revealed={revealed ? "" : undefined}
          className={`stacks-world-shell fixed inset-0 z-10 ${
            revealed ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <CanvasBoundary onError={demote}>
            <Profiler id="canvas-react" onRender={recordPerformanceCommit}>
              <StacksCanvas
                data={data}
                onReady={() => setWorldReady(true)}
                onLost={demote}
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
            <TouchInteractionLayer />
          </div>
          {/* The canvas is allowed to finish behind an opaque curtain. The
              handoff can therefore be choreographed without filtering or
              transforming the world itself — both would turn the placards'
              backdrop filters into the wrong compositing root. */}
          <div aria-hidden className="stacks-world-curtain" />
        </div>
      )}
      {(mode === "flat" || !flatGone) && (
        <FlatHome slots={slots} animated={mode === "flat"} />
      )}
      {/* Books modal — mounted at the root, outside GrainientBackground's
          [contain:paint] and the world's transforms, so fixed positioning
          resolves to the viewport. */}
      <StacksBookModal bookCount={data.bookStats.total} />
    </>
  );
}
