"use client";

import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "~/lib/utils";

import styles from "./meet.module.css";

/** Where the sheet rests: gone, showing only its top, or all of it. */
export type SheetState = "closed" | "peek" | "full";

/** Critically damped, so it eases all the way in with no overshoot to
 * settle back from, as iOS sheets do. */
const SPRING = { type: "spring" as const, duration: 0.5, bounce: 0 };
/** The room kept above the card when it's open. */
const ABOVE = 56;
/** Off the screen's bottom and sides: the bar sits 20px in, a little
 * narrower than Safari's toolbar, and the card grows out to 16px as it
 * grows up. It must never touch the screen's bottom edge, even while it
 * arrives (see `arrive` below). */
const BOTTOM = 8;
const EDGE = { bar: 20, card: 16 };
/** Its glass: clear as a bar, and as the card about as clear as the bar
 * once was, as the Owner asked on November 4, 2026. */
const GLASS = { bar: 0.62, card: 0.78 };
/** Space under the time in the bar. */
const BAR_PAD = 16;
/** A touch this far is a drag, not a tap. */
const SLOP = 6;

/**
 * The booking card on a phone. With a time picked it floats as a bar at the
 * bottom of the screen, clear of its edges, showing the time down to the
 * child marked `data-peek-end`. A swipe up, or a tap, grows that same bar
 * upward into a floating card with the whole form, over a dimmed page; a
 * swipe down, a tap on the page, or Escape shrinks it back. It only grows
 * and shrinks, never scales once it's there, so its words hold still as it
 * moves. While a time is picked it stays: only the page puts it away, once
 * nothing is.
 * The grid above stays live in the bar, so a tap there picks another time.
 * On a phone's keyboard it rides up with the visible viewport so the field
 * being typed in stays in view.
 */
export function BookingSheet({
  state,
  onState,
  label,
  children,
}: {
  state: SheetState;
  onState: (state: SheetState) => void;
  label: string;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const sheet = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const height = useMotionValue(0);
  const shown = useMotionValue(0);
  const [size, setSize] = useState({ bar: 0, card: 0 });
  const [lift, setLift] = useState(0);
  const drag = useRef<{
    id: number;
    y: number;
    from: number;
    at: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const dragged = useRef(false);

  // The bar's and the card's heights, kept up as the form changes.
  useLayoutEffect(() => {
    const outer = sheet.current;
    const inner = content.current;
    if (!outer || !inner) return;
    const measure = () => {
      const end = inner.querySelector<HTMLElement>("[data-peek-end]");
      // From the sheet's top: the handle, then the content to the time's end.
      const offset = inner.offsetTop;
      const bar = end
        ? offset +
          end.getBoundingClientRect().bottom -
          inner.getBoundingClientRect().top +
          BAR_PAD
        : offset + inner.offsetHeight;
      const room =
        (window.visualViewport?.height ?? window.innerHeight) - ABOVE - BOTTOM;
      const card = Math.max(bar, Math.min(offset + inner.offsetHeight, room));
      setSize({ bar, card });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
    // The keyboard changes the room above the card.
  }, [lift]);
  const sizeNow = useRef(size);
  sizeNow.current = size;

  // Which edges of the card the form runs past, as it scrolls.
  const [cut, setCut] = useState({ top: false, bottom: false });
  const edges = () => {
    const body = scroller.current;
    if (!body) return;
    const top = state === "full" && body.scrollTop > 1;
    const bottom =
      state === "full" &&
      body.scrollTop + body.clientHeight < body.scrollHeight - 1;
    setCut((was) =>
      was.top === top && was.bottom === bottom ? was : { top, bottom },
    );
  };
  const edgesNow = useRef(edges);
  edgesNow.current = edges;
  useEffect(() => {
    const body = scroller.current;
    const inner = content.current;
    if (!body || !inner) return;
    const observer = new ResizeObserver(() => edgesNow.current());
    observer.observe(body);
    observer.observe(inner);
    edgesNow.current();
    return () => observer.disconnect();
  }, [state]);

  const rest = (at: SheetState) => (at === "full" ? size.card : size.bar);

  const settle = (at: SheetState, velocity = 0) => {
    if (size.bar === 0) return;
    const quick = reducedMotion ? { duration: 0 } : SPRING;
    void animate(shown, at === "closed" ? 0 : 1, quick);
    if (at === "closed") return;
    if (height.get() === 0) height.set(rest(at));
    else void animate(height, rest(at), { ...quick, velocity });
    if (at !== "full") if (scroller.current) scroller.current.scrollTop = 0;
  };

  useEffect(() => {
    settle(state);
    // Settles on a new state or size; `settle` reads both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, size.bar, size.card]);

  // A phone's keyboard shrinks the visible viewport but not the layout one,
  // so the card sits above it by the difference. That counts only while a
  // field in the card has focus: iOS can leave the last reading standing
  // after the keyboard goes, which held the bar halfway up the screen. So
  // it reads again as focus leaves, and once more after the viewport has
  // settled.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let late = 0;
    const read = () => {
      const typing =
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches("input, textarea, select") &&
        !!sheet.current?.contains(document.activeElement);
      setLift(
        typing
          ? Math.max(
              0,
              window.innerHeight - viewport.height - viewport.offsetTop,
            )
          : 0,
      );
    };
    const follow = () => {
      read();
      window.clearTimeout(late);
      late = window.setTimeout(read, 400);
    };
    // During focusout the old field still looks focused, so wait a frame.
    const left = () => requestAnimationFrame(follow);
    viewport.addEventListener("resize", follow);
    viewport.addEventListener("scroll", follow);
    window.addEventListener("resize", follow);
    document.addEventListener("focusin", follow);
    document.addEventListener("focusout", left);
    return () => {
      window.clearTimeout(late);
      viewport.removeEventListener("resize", follow);
      viewport.removeEventListener("scroll", follow);
      window.removeEventListener("resize", follow);
      document.removeEventListener("focusin", follow);
      document.removeEventListener("focusout", left);
    };
  }, []);

  useEffect(() => {
    if (state !== "full") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onState("peek");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onState]);

  // Only the handle and the time above the fields drag it, so typing,
  // tapping a button, and scrolling a long form stay what they are.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (state === "closed") return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "input, textarea, select, button:not([data-handle]), a, label",
      )
    )
      return;
    if (!target.closest("[data-handle], [data-peek-end]")) return;
    dragged.current = false;
    drag.current = {
      id: event.pointerId,
      y: event.clientY,
      from: height.get(),
      at: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.id !== event.pointerId) return;
    const dy = event.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dy) < SLOP) return;
      d.moved = true;
      dragged.current = true;
      sheet.current?.setPointerCapture?.(event.pointerId);
    }
    // Past either resting height it stretches, more stiffly the further.
    const wanted = d.from - dy;
    const next =
      wanted > size.card
        ? size.card + (wanted - size.card) * 0.12
        : wanted < size.bar
          ? size.bar - (size.bar - wanted) * 0.2
          : wanted;
    const elapsed = Math.max(1, event.timeStamp - d.at);
    d.velocity = ((height.get() - next) / elapsed) * 1000;
    d.at = event.timeStamp;
    height.set(next);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    // Where a flick would carry it, then the nearer resting height. The
    // velocity is downward-positive; the height grows upward.
    const aim = height.get() - d.velocity * 0.18;
    const next: SheetState =
      Math.abs(size.card - aim) < Math.abs(size.bar - aim) ? "full" : "peek";
    if (next === state) settle(next, -d.velocity);
    else onState(next);
  };

  // How far the bar has grown into the card, 0 to 1, which turns its glass
  // from clear to nearly solid as it goes.
  const open = useTransform(height, (h) => {
    const { bar, card } = sizeNow.current;
    if (card <= bar) return 0;
    return Math.max(0, Math.min(1, (h - bar) / (card - bar)));
  });
  const glass = useTransform(
    open,
    (o) =>
      `rgb(var(--mt-glass) / ${(GLASS.bar + (GLASS.card - GLASS.bar) * o).toFixed(3)})`,
  );
  // The page behind fades to half and shades as the card opens: its own
  // parts fade, through --sheet-open, since a fixed layer over the page
  // brings back Safari's strip under its toolbar. It's set on <html>, whose
  // background Safari paints under its status bar, so that shades too.
  useMotionValueEvent(open, "change", (o) => {
    document.documentElement.style.setProperty("--sheet-open", o.toFixed(3));
  });
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--sheet-open");
    },
    [],
  );
  // It arrives by growing a touch from its own bottom edge, never by
  // rising from below: on its way up from under the screen's edge Safari
  // took it for a toolbar of the page's own, even at opacity 0, and kept
  // the strip under its toolbar after it settled.
  const arrive = useTransform(shown, [0, 1], [0.94, 1]);
  const edge = useTransform(open, [0, 1], [EDGE.bar, EDGE.card]);

  // A tap on the page outside the card shrinks it back to the bar, and
  // still does what it does there, so a tap on the grid picks that time.
  // No layer over the page catches it: Safari tints the strip under its
  // toolbar from fixed layers at the screen's bottom.
  useEffect(() => {
    if (state !== "full") return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (!sheet.current?.contains(event.target as Node)) onState("peek");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [state, onState]);

  const place = {
    height,
    opacity: shown,
    scale: arrive,
    transformOrigin: "50% 100%",
    left: edge,
    right: edge,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${BOTTOM + lift}px)`,
  };

  return (
    <>
      <motion.div
        ref={sheet}
        role="dialog"
        aria-label={label}
        aria-hidden={state === "closed" || undefined}
        inert={state === "closed" || undefined}
        data-state={state}
        data-more={cut.bottom || undefined}
        className={cn(styles.sheet, "fixed z-50 md:hidden")}
        style={{ ...place, backgroundColor: glass }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          settle(state);
        }}
        // A tap anywhere on the bar grows it into the card, to go on
        // booking, and a tap on the card's top, the same time, shrinks it.
        onClick={(event) => {
          if (state === "closed" || dragged.current) return;
          const target = event.target as HTMLElement;
          if (target.closest("input, textarea, select, button, a, label"))
            return;
          if (state === "peek") onState("full");
          else if (target.closest("[data-peek-end]")) onState("peek");
        }}
      >
        <button
          type="button"
          data-handle
          aria-label={state === "full" ? "Show less" : "Show the whole booking"}
          onClick={() => {
            if (dragged.current) return;
            onState(state === "full" ? "peek" : "full");
          }}
          className={styles.sheetHandle}
        >
          <span aria-hidden />
        </button>
        <div ref={scroller} className={styles.sheetBody} onScroll={edges}>
          <div ref={content}>{children}</div>
        </div>
        {/* Frost where the form runs up past the handle, so it blurs out
            at the card's top edge instead of being cut off. Its foot is
            the Book button's dock (.sheetDock), on data-more. */}
        <span
          aria-hidden
          className={styles.sheetEdge}
          data-shown={cut.top || undefined}
        />
      </motion.div>
    </>
  );
}

/** The caret's hop: up and back twice, the second smaller. */
const HOP = {
  y: [null, -5, 0, -2.5, 0],
  dark: [null, 1, 1, 1, 0],
  timing: {
    times: [0, 0.3, 0.55, 0.75, 1],
    duration: 0.7,
    ease: [0.3, 0, 0.3, 1] as const,
  },
};
/** One pass of the shimmer across the words. */
const SWEEP = 1500;

/**
 * Faint words under the time: in the bar, swipe up to book this time; in
 * the card, swipe down to pick another. The two share one place and hand
 * over as the drag passes halfway, so the height never moves under the
 * spring. The swipe up's caret drifts slowly upward; the swipe down's
 * holds still. Each time a new `cue` comes, a time
 * just picked, the caret hops, darkening to the shimmer's highlight, and
 * the swipe up's words catch a shimmer, so the next step is clear. A cue
 * that comes while they're still going carries them on from where they
 * are: the hop starts again from the caret's height, and the shimmer
 * finishes its pass and makes one more, so quick picks never jump.
 */
export function SwipeHint({
  open,
  cue,
}: {
  open: boolean;
  cue?: string | number | null;
}) {
  const reducedMotion = useReducedMotion();
  const hop = useMotionValue(0);
  const dark = useMotionValue(0);
  const color = useTransform(
    dark,
    (d) => `rgb(var(--mt-ink) / ${(0.32 + 0.58 * d).toFixed(3)})`,
  );
  const shimmer = useRef<HTMLSpanElement>(null);
  const sweep = useRef<Animation | null>(null);
  const cued = useRef<typeof cue>(null);

  useEffect(() => {
    if (cue == null || cue === cued.current || open || reducedMotion) return;
    cued.current = cue;
    // Mid-hop, go again at once from where the caret is, which stops the
    // hop it was in; at rest, wait a beat for the bar to arrive.
    const busy = hop.isAnimating() || dark.isAnimating();
    const timing = { ...HOP.timing, delay: busy ? 0 : 0.3 };
    void animate(hop, HOP.y, timing);
    void animate(dark, HOP.dark, timing);

    const words = shimmer.current;
    const running = sweep.current;
    if (running?.playState === "running") {
      // Finish this pass and make one more.
      const at = running.effect?.getComputedTiming().currentIteration ?? 0;
      running.effect?.updateTiming({ iterations: at + 2 });
    } else if (typeof words?.animate === "function") {
      sweep.current = words.animate(
        [{ backgroundPosition: "100% 0" }, { backgroundPosition: "0 0" }],
        {
          duration: SWEEP,
          delay: 450,
          iterations: 2,
          easing: "cubic-bezier(0.4, 0, 0.3, 1)",
        },
      );
    }
  }, [cue, open, reducedMotion, hop, dark]);

  // Opening the card puts the hop and the shimmer away.
  useEffect(() => {
    if (!open) return;
    sweep.current?.cancel();
    void animate(hop, 0, { duration: 0.2 });
    void animate(dark, 0, { duration: 0.2 });
  }, [open, hop, dark]);
  useEffect(
    () => () => {
      sweep.current?.cancel();
      cued.current = null;
      hop.stop();
      dark.stop();
    },
    [hop, dark],
  );

  // Each line is the hint for one end, and the drag hands one to the other
  // between 40% and 60% open (CSS, through --sheet-open).
  return (
    <p aria-hidden className={cn(styles.swipeHint, "grid pt-1")}>
      <span className={cn(styles.swipeLine, styles.swipeUp)}>
        <motion.span className="inline-flex" style={{ y: 2 }}>
          <motion.span className="inline-flex" style={{ y: hop, color }}>
            <CaretUpIcon
              size={13}
              weight="bold"
              className={styles.swipeArrow}
            />
          </motion.span>
        </motion.span>
        <span ref={shimmer} className={styles.shimmer}>
          Swipe up to book this time
        </span>
      </span>
      <span className={cn(styles.swipeLine, styles.swipeDown)}>
        <CaretDownIcon size={13} weight="bold" />
        Swipe down to pick another time
      </span>
    </p>
  );
}
