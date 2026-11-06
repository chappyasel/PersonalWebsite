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

import { INTRO } from "./intro";
import styles from "./meet.module.css";

/** Where the sheet rests: gone, showing only its top, or all of it. */
export type SheetState = "closed" | "peek" | "full";

/** Critically damped, so it eases all the way in with no overshoot to
 * settle back from, as iOS sheets do. */
const SPRING = { type: "spring" as const, duration: 0.5, bounce: 0 };
/** Opening all the way and back down to its top: quicker, passing its
 * mark a little and settling back, as the picked meeting slides but
 * softer (the Owner, November 6, 2026). */
const SNAP = { type: "spring" as const, duration: 0.38, bounce: 0.12 };
/** Its rise into view: a little slower, with a touch of overshoot. */
const RISE = { type: "spring" as const, duration: 0.7, bounce: 0.14 };
/** How open the card is when its dock starts in: --dock-in's zero, in
 * meet.module.css (`--sheet-open * 1.6 - 0.4`). */
const DOCK_FROM = 0.25;
/** How long after a field in the card loses focus it still counts as
 * typed in: the gap as focus moves to the next field, inside the late
 * read's 400ms, which settles it. */
const FIELD_GAP_MS = 300;
/** The least a keyboard takes from the visible height: less is Safari's
 * bars coming and going. */
const KEYBOARD_MIN = 120;
/** A revealed field's label stays this far under the card's top, below
 * the form's fade under the handle (.sheetBody's 16px). */
const REVEAL_TOP = 20;
/** Its first rise waits for the page's entrance (intro.ts): in the long
 * one, until the title has landed; in the short one, for the Days. */
const FIRST_RISE = { long: (INTRO.landed - 100) / 1000, short: 0.45 };
/** The room kept above the open card, under the status bar. */
const ABOVE = 8;
/** Off the screen's bottom and sides: the bar sits 20px in, a little
 * narrower than Safari's toolbar, and the card grows out to 16px as it
 * grows up. It must never touch the screen's bottom edge, even while it
 * arrives (see `arrive` below). */
const BOTTOM = 8;
const EDGE = { bar: 20, card: 16 };
/** Its glass: clear as a bar, and as the card about as clear as the bar
 * once was, as the Owner asked on November 4, 2026. */
const GLASS = { bar: 0.56, card: 0.72 };
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
  dock,
  children,
}: {
  state: SheetState;
  onState: (state: SheetState) => void;
  label: string;
  /** At the card's foot, over the form's end: the Book button. */
  dock?: ReactNode;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const sheet = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const docked = useRef<HTMLDivElement>(null);
  const safeTop = useRef<HTMLSpanElement>(null);
  const safeBottom = useRef<HTMLSpanElement>(null);
  // Fixed at the foot, as the card is: where the card's bottom is measured
  // from, read off the page rather than from innerHeight (see below).
  const floor = useRef<HTMLSpanElement>(null);
  const height = useMotionValue(0);
  const shown = useMotionValue(0);
  // `fits`: the whole form shows in the card, so nothing in it scrolls.
  const [size, setSize] = useState({ bar: 0, card: 0, dock: 0, fits: true });
  // How far it rides up over the keyboard, and the most it may be tall
  // from there: read together, so they reach the screen in the same frame.
  const [fit, setFit] = useState({ lift: 0, max: Infinity });
  const { lift } = fit;
  const drag = useRef<{
    id: number;
    y: number;
    from: number;
    at: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const dragged = useRef(false);
  // The last reading taken with the keyboard up, held while a field keeps
  // focus (see the keyboard's effect below).
  const held = useRef<{ lift: number; max: number; visible: number } | null>(
    null,
  );
  const risen = useRef(false);

  // The bar's and the card's heights, kept up as the form changes.
  useLayoutEffect(() => {
    const outer = sheet.current;
    const inner = content.current;
    if (!outer || !inner) return;
    const measure = () => {
      const end = inner.querySelector<HTMLElement>("[data-peek-end]");
      // From the sheet's top: the handle, then the content to the time's end.
      // Screen rects carry the sheet's arrival scale, so the time's end is
      // read back at full size, and rounded, so a fraction of a pixel's
      // reflow as the card widens doesn't make a new size.
      const offset = inner.offsetTop;
      const scale = outer.getBoundingClientRect().width / outer.offsetWidth;
      const bar = end
        ? Math.round(
            offset +
              (end.getBoundingClientRect().bottom -
                inner.getBoundingClientRect().top) /
                (scale || 1) +
              BAR_PAD,
          )
        : offset + inner.offsetHeight;
      // The screen's visible height, keyboard or not, less the card's
      // margin at the foot and the status bar at the top. Only the visible
      // viewport's height is read: with the keyboard up, iOS scrolls the
      // page and pans that viewport, and the card's rect and the viewport's
      // offset disagreed on a phone about where the screen's top was, which
      // left about 110px empty above the card.
      const visible =
        held.current?.visible ??
        window.visualViewport?.height ??
        window.innerHeight;
      const room =
        visible -
        BOTTOM -
        (safeBottom.current?.offsetHeight ?? 0) -
        (safeTop.current?.offsetHeight ?? 0) -
        ABOVE;
      // The dock sits over the form's end, which runs on under it.
      const dock = docked.current?.offsetHeight ?? 0;
      const whole = offset + inner.offsetHeight + dock;
      const card = Math.max(bar, Math.min(whole, room));
      const fits = whole <= room;
      setSize((was) =>
        was.bar === bar &&
        was.card === card &&
        was.dock === dock &&
        was.fits === fits
          ? was
          : { bar, card, dock, fits },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    if (docked.current) observer.observe(docked.current);
    // A window made shorter, as on a computer, leaves the card less room:
    // past it, the form scrolls inside the card.
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    // Back from another app or tab, the room may have changed while hidden.
    const back = () => {
      if (document.visibilityState === "visible") measure();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("pageshow", back);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
    // The keyboard changes the room above the card.
  }, [lift]);
  const sizeNow = useRef(size);
  sizeNow.current = size;

  const rest = (at: SheetState) => (at === "full" ? size.card : size.bar);

  /** The field in the card that has the keyboard, if one does. */
  const typing = () => {
    const focused = document.activeElement;
    return focused instanceof HTMLElement &&
      focused.matches("input, textarea, select") &&
      !!sheet.current?.contains(focused)
      ? focused
      : null;
  };

  // The field that takes the keyboard, with its label, scrolled clear of
  // the Book button floating over the form's foot, which iOS doesn't know
  // about. The last field goes to the form's very end, so the line under
  // it (where the meeting happens) shows too, and it stays there as the
  // field grows. After two frames, so iOS's own scroll has gone first, and
  // again whenever the card's size changes under the keyboard.
  const reveal = () => {
    const body = scroller.current;
    const field = typing();
    if (!body || !field || !body.contains(field)) return;
    const fields = body.querySelectorAll(
      "input:not([type=hidden]), textarea, select",
    );
    const end = body.scrollHeight - body.clientHeight;
    let top = end;
    if (fields[fields.length - 1] !== field) {
      const view = body.getBoundingClientRect();
      const box = (field.parentElement ?? field).getBoundingClientRect();
      const upper = view.top + REVEAL_TOP;
      const lower = view.bottom - sizeNow.current.dock;
      top =
        body.scrollTop +
        (box.bottom > lower
          ? box.bottom - lower
          : box.top < upper
            ? box.top - upper
            : 0);
    }
    top = Math.max(0, Math.min(end, Math.round(top)));
    if (Math.abs(top - body.scrollTop) < 1) return;
    body.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
  };
  const revealSoon = () =>
    requestAnimationFrame(() => requestAnimationFrame(reveal));

  const settle = (at: SheetState, velocity = 0) => {
    if (size.bar === 0) return;
    const quick = reducedMotion ? { duration: 0 } : SPRING;
    if (at === "closed" || shown.get() > 0 || reducedMotion) {
      void animate(shown, at === "closed" ? 0 : 1, quick);
    } else {
      // Rising into view. The first time, on the page's arrival, it waits
      // for the rest of the page.
      const root = sheet.current?.closest(".meet-root");
      const delay = risen.current
        ? 0
        : root?.hasAttribute("data-intro")
          ? FIRST_RISE.long
          : root?.hasAttribute("data-entering")
            ? FIRST_RISE.short
            : 0;
      risen.current = true;
      void animate(shown, 1, { ...RISE, delay });
    }
    // Swiped down to pick another time, or closed, the keyboard goes with
    // the card, and so does whatever a password manager pinned to the
    // field: closed, the card is inert, but Safari leaves focus where it
    // was.
    if (at !== "full") {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && sheet.current?.contains(focused))
        focused.blur();
    }
    if (at === "closed") return;
    // While a field has the keyboard up, a new size is the keyboard's: its
    // foot has already moved with it (lift), so the height changes in the
    // same frame, and the card's top stays where it is. A spring here made
    // the top jump and spring back each time the keyboard changed height,
    // as it does between fields (LinkedIn's has no suggestion bar).
    if (height.get() === 0 || (at === "full" && typing())) {
      height.stop();
      height.set(rest(at));
    } else
      void animate(
        height,
        rest(at),
        reducedMotion ? quick : { ...SNAP, velocity },
      );
    if (at === "full") return;
    if (scroller.current) scroller.current.scrollTop = 0;
  };

  useEffect(() => {
    // Not under a finger: a size that changes mid-drag, as the card widens,
    // would spring it back against the drag. Letting go settles it.
    if (drag.current?.moved) return;
    settle(state);
    // Settles on a new state or size; `settle` reads both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, size.bar, size.card]);

  useEffect(() => {
    const body = scroller.current;
    if (!body) return;
    const onFocus = () => revealSoon();
    // Typing that grows the last field keeps the line under it in view.
    const onInput = (event: Event) => {
      if (event.target instanceof HTMLTextAreaElement) revealSoon();
    };
    body.addEventListener("focusin", onFocus);
    body.addEventListener("input", onInput);
    return () => {
      body.removeEventListener("focusin", onFocus);
      body.removeEventListener("input", onInput);
    };
    // `reveal` reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state === "full") revealSoon();
    // A new size or room under the keyboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, size.card, fit.max]);

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
    // When focus last left a field in the card. Moving from one field to
    // the next, nothing has focus for a moment while the keyboard stays
    // up; read then, the card dropped to the screen's foot and rose again
    // as the next field took focus. So a field that just lost focus still
    // counts, until the late read settles it.
    let leftAt = -Infinity;
    // The visible height with no keyboard, the most seen while no field
    // has focus, read again when the screen turns.
    let full = 0;
    let width = window.innerWidth;
    const read = () => {
      const typing =
        (document.activeElement instanceof HTMLElement &&
          document.activeElement.matches("input, textarea, select") &&
          !!sheet.current?.contains(document.activeElement)) ||
        performance.now() - leftAt < FIELD_GAP_MS;
      // Where the visible screen ends against the foot the card is fixed
      // to. Safari now shrinks the layout viewport with the keyboard as
      // well as scrolling the visible one, so the visible foot can sit
      // below the layout's: then the card goes down (a lift under 0), or it
      // stood 62px over the keyboard. Both ends are read in the page's own
      // coordinates: the fixed foot from a marker pinned there, and the
      // visible screen from the page's top. Back from another app with a
      // field focused, Safari's innerHeight shrank further with each field
      // while fixed things stayed put, and the card sank lower each time.
      const page = document.documentElement.getBoundingClientRect().top;
      const screenTop = floor.current
        ? viewport.pageTop + page
        : viewport.offsetTop;
      const layoutFoot =
        floor.current?.getBoundingClientRect().top ?? window.innerHeight;
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        full = 0;
      }
      if (!typing) {
        full = Math.max(full, viewport.height);
        held.current = null;
      }
      // With the keyboard still up and a field still focused, Safari once
      // reported the whole screen as visible again, four seconds in, and
      // the card dropped behind the keyboard. While a field has focus, a
      // reading with no keyboard in it keeps the last one that had it.
      const keyboard = viewport.height < full - KEYBOARD_MIN;
      const kept = typing && !keyboard ? held.current : null;
      const lift = kept
        ? kept.lift
        : typing
          ? Math.round(layoutFoot - viewport.height - screenTop)
          : 0;
      // The card's foot on the visible screen, and from it up to just under
      // the status bar: the card is never taller, so its top never reaches
      // the screen's top edge. A fixed element that touches that edge, for
      // even a frame, makes Safari take it for the page's own header: it
      // paints a solid strip under the status bar in place of its blur, and
      // keeps it until Safari is quit. As the keyboard came up the card's
      // foot rose 173px in one frame while its height was still springing
      // down, and its top went 11px past the edge.
      const foot =
        layoutFoot -
        screenTop -
        lift -
        BOTTOM -
        (safeBottom.current?.offsetHeight ?? 0);
      const max = kept
        ? kept.max
        : Math.max(
            0,
            Math.floor(foot - (safeTop.current?.offsetHeight ?? 0) - ABOVE),
          );
      if (typing && keyboard)
        held.current = { lift, max, visible: viewport.height };
      setFit((was) =>
        was.lift === lift && was.max === max ? was : { lift, max },
      );
    };
    const follow = () => {
      read();
      window.clearTimeout(late);
      late = window.setTimeout(read, 400);
    };
    // Leaving the page with a field focused, iOS brought the keyboard back
    // on return, but the viewport events that place the card came late or
    // never: the card came back squashed to its Book button, standing well
    // over the keyboard. So the field lets the keyboard go as the page
    // hides, and the card reads the screen again as it comes back, and
    // once more after Safari's bars have settled.
    let back = 0;
    const away = () => {
      if (document.visibilityState === "hidden") {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && sheet.current?.contains(focused))
          focused.blur();
        return;
      }
      follow();
      window.clearTimeout(back);
      back = window.setTimeout(read, 1000);
    };
    // During focusout the old field still looks focused, so wait a frame.
    const left = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        sheet.current?.contains(event.target)
      )
        leftAt = performance.now();
      requestAnimationFrame(follow);
    };
    viewport.addEventListener("resize", follow);
    viewport.addEventListener("scroll", follow);
    window.addEventListener("resize", follow);
    document.addEventListener("focusin", follow);
    document.addEventListener("focusout", left);
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pageshow", away);
    read();
    return () => {
      window.clearTimeout(late);
      window.clearTimeout(back);
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pageshow", away);
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

  // The handle and the time above the fields drag it. So does anywhere on
  // the open card when the whole form fits, since then nothing in it
  // scrolls (.sheet[data-fits]): a field too, since a tap still focuses it
  // and only a move past SLOP drags. Not the field being typed in, where a
  // drag moves the caret or selects. Buttons and links stay what they
  // are, and so does scrolling a long form.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (state === "closed") return;
    const target = event.target as HTMLElement;
    if (target.closest("button:not([data-handle]), a")) return;
    const anywhere = state === "full" && size.fits;
    const field = target.closest("input, textarea, select, label");
    if (field && (!anywhere || field === document.activeElement)) return;
    if (!anywhere && !target.closest("[data-handle], [data-peek-end]")) return;
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
  // While the dock is faded all the way out (--dock-in at 0, under a
  // quarter open), it's hidden too. On an iPhone the Book button showed
  // half through the bar as the page arrived, over its opacity of 0, and
  // a hidden button can't.
  const showDock = (o: number) => {
    const element = sheet.current;
    if (!element) return;
    if (o > DOCK_FROM) element.setAttribute("data-dock", "");
    else element.removeAttribute("data-dock");
  };
  // The page behind fades to half as the card opens: its own parts fade,
  // through --sheet-open, since a fixed layer over the page brings back
  // Safari's strip under its toolbar. The page's colour holds still (see
  // --mt-page-now in meet.css), so the status bar never changes.
  useMotionValueEvent(open, "change", (o) => {
    document.documentElement.style.setProperty("--sheet-open", o.toFixed(3));
    showDock(o);
  });
  // Written on mount too, not only on a change: a remount (a hot reload,
  // or React's strict double run) clears it, and an open card that then
  // holds still would leave the Book button's dock faded out.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--sheet-open", open.get().toFixed(3));
    showDock(open.get());
    return () => {
      root.removeProperty("--sheet-open");
    };
  }, [open]);
  // It rises into view from its own foot: its top edge climbs and its
  // words ride up with it, cut off at the foot, which never moves. Never
  // by sliding the whole card up from below: on its way up from under the
  // screen's edge Safari took it for a toolbar of the page's own, even at
  // opacity 0, and kept the strip under its toolbar after it settled.
  const drawn = useTransform(
    [height, shown],
    ([h, s]) => (h as number) * Math.max(0, s as number),
  );
  const fade = useTransform(shown, [0, 0.3], [0, 1]);
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
    height: drawn,
    opacity: fade,
    left: edge,
    right: edge,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${BOTTOM + lift}px)`,
    maxHeight: Number.isFinite(fit.max) ? fit.max : undefined,
  };

  return (
    <>
      <span
        ref={floor}
        aria-hidden
        className="pointer-events-none invisible fixed bottom-0 left-0 h-0 w-0"
      />
      <motion.div
        ref={sheet}
        role="dialog"
        aria-label={label}
        aria-hidden={state === "closed" || undefined}
        inert={state === "closed" || undefined}
        data-state={state}
        data-fits={size.fits || undefined}
        className={cn(styles.sheet, "fixed z-50 min-[872px]:hidden")}
        style={{
          ...place,
          backgroundColor: glass,
          ["--dock-h" as string]: `${size.dock}px`,
        }}
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
        {/* The form fades out under the handle and above the dock (see
            .sheetBody's mask), onto the card's own glass. */}
        <span ref={safeTop} aria-hidden className={styles.sheetSafeTop} />
        <span ref={safeBottom} aria-hidden className={styles.sheetSafeBottom} />
        <div ref={scroller} className={styles.sheetBody}>
          <div ref={content}>{children}</div>
        </div>
        {dock && (
          <div ref={docked} className={styles.sheetDock}>
            {dock}
          </div>
        )}
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
