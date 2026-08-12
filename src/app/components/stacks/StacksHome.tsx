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
import { Component, useCallback, useEffect, useRef, useState } from "react";

import FlatHome from "./FlatHome";
import { type StacksData, type StacksSlots } from "./data";
import BootScreen from "./dom/BootScreen";
import ChromeLayer from "./dom/ChromeLayer";
import PlacardLayer from "./dom/PlacardLayer";
import UnitRail from "./dom/UnitRail";
import ScrollBridges from "./input/ScrollBridges";
import {
  getLoadProgress,
  isWarmBoot,
  rememberWarmBoot,
  setLoadProgress,
  setWorldPhase,
} from "./loading";
import StacksBookModal from "./modal/StacksBookModal";
import { useStacks } from "./store";

const StacksCanvas = dynamic(() => import("./StacksCanvas"), { ssr: false });

/** Long enough that no real network trips it, short enough that a genuinely
 * wedged tab still gets a readable page. */
const HANG_BACKSTOP_MS = 40000;
/** After the first frame paints, how long to keep the boot screen up waiting
 * for the rest of the props. The room builds itself in public after this —
 * every prop is independently suspended, so a late arrival is a fade, not a
 * hole. */
const STREAM_GRACE_MS = 900;
/** Enough of the assets that unit 0 is dressed. Waiting for all of them means
 * waiting on units the visitor cannot see yet. */
const REVEAL_PROGRESS = 0.85;

/** navigator.connection is still not in the DOM lib. */
type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean };
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

  const demote = useCallback(() => {
    setWorldPhase(null);
    setMode("flat");
  }, [setMode]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWorldPhase(null);
      return;
    }
    // Save-Data, checked here as well as in the pre-paint script. The script
    // used to be the only place, which meant it never actually held: it can
    // decline to set the attribute, but this effect then set it anyway and
    // mounted the world a moment later. A visitor who asked their browser to
    // conserve got the document for half a second and a megabyte of room
    // after it.
    if ((navigator as NavigatorWithConnection).connection?.saveData) {
      setWorldPhase(null);
      return;
    }
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
      if (!gl) {
        setWorldPhase(null);
        return;
      }
    } catch {
      setWorldPhase(null);
      return;
    }
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
    };
  }, []);

  // Nothing is downloading until the component that owns the import renders,
  // and `mode` only flips one tick later. Kicking it here overlaps the chunk
  // fetch with the rest of hydration instead of queueing behind it.
  useEffect(() => {
    void (
      StacksCanvas as unknown as { render?: { preload?: () => void } }
    ).render?.preload?.();
    void (StacksCanvas as unknown as { preload?: () => void }).preload?.();
  }, []);

  // Hold the boot screen until the room is worth looking at: the first frame
  // has painted AND most of the assets are in — or the grace expires and the
  // remainder streams in on screen.
  //
  // A warm boot deliberately does NOT get a shorter grace, which is the first
  // thing you reach for. Measured: on a load with the assets already local,
  // REVEAL_PROGRESS is crossed about 130ms after the first frame, so the
  // reveal is already firing on the progress arm and the grace is never
  // reached. Every run where it WAS reached had progress stalled around 0.25
  // — the room genuinely a quarter built. Cutting the grace would only ever
  // fire in that case, i.e. it would trade the wait for holes on precisely
  // the visit where the visitor knows what the room is supposed to look like.
  const readyAt = useRef(0);
  useEffect(() => {
    if (!worldReady || revealed) return;
    readyAt.current ||= performance.now();
    const check = () => {
      if (
        getLoadProgress() >= REVEAL_PROGRESS ||
        performance.now() - readyAt.current > STREAM_GRACE_MS
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
    // The world got here. Record it, with how long it took: that is what the
    // next load's pre-paint script reads to decide whether to hold the
    // loading animation back, and for how long.
    rememberWarmBoot(performance.now());
    // The shelf finishes filling as it fades. Reveal is allowed to happen on
    // the streaming grace rather than on 100% of the assets, and a loader
    // that dissolves half-full reads as giving up rather than as finishing.
    setLoadProgress(1);
    const timeout = setTimeout(() => setFlatGone(true), 420);
    return () => clearTimeout(timeout);
  }, [revealed]);

  useEffect(() => {
    if (mode !== "world" || worldReady) return;
    const timeout = setTimeout(demote, HANG_BACKSTOP_MS);
    return () => clearTimeout(timeout);
  }, [mode, worldReady, demote]);

  return (
    <>
      {mode === "world" && (
        <div
          data-load-path={bootPath}
          data-revealed={revealed ? "" : undefined}
          className={`stacks-world-shell fixed inset-0 z-10 ${
            revealed ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <CanvasBoundary onError={demote}>
            <StacksCanvas
              data={data}
              onReady={() => setWorldReady(true)}
              onLost={demote}
            />
          </CanvasBoundary>
          <UnitRail />
          <ChromeLayer />
          <PlacardLayer data={data} slots={slots} />
          <ScrollBridges />
          {/* The canvas is allowed to finish behind an opaque curtain. The
              handoff can therefore be choreographed without filtering or
              transforming the world itself — both would turn the placards'
              backdrop filters into the wrong compositing root. */}
          <div aria-hidden className="stacks-world-curtain" />
        </div>
      )}
      <BootScreen />
      {(mode === "flat" || !flatGone) && <FlatHome slots={slots} />}
      {/* Books modal — mounted at the root, outside GrainientBackground's
          [contain:paint] and the world's transforms, so fixed positioning
          resolves to the viewport. */}
      <StacksBookModal bookCount={data.bookStats.total} />
    </>
  );
}
