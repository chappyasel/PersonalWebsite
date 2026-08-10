"use client";

// Museum placards — the dense DOM content for each unit, screen-fixed as a
// sibling of the canvas (never <Html transform>). Desktop: one framed panel
// per unit docked right, crossfaded by activeUnit. Mobile: a bottom sheet
// with three detents — peek (the default, filling the floor void under the
// bookcase), expanded (full height), and dismissed (a chip, the world with
// nothing on it). Panel bodies lazy-mount on first activation and stay
// mounted.
import {
  BookOpenIcon,
  BookOpenTextIcon,
  BooksIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretUpIcon,
  ClockIcon,
  XIcon,
} from "@phosphor-icons/react";
import { animate, AnimatePresence, motion, useMotionValue } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { devSubdomainUrl } from "~/lib/util";
import licenses from "~~/models/LICENSES.json";

import { UNITS, type StacksData, type StacksSlots } from "../data";
import { PHOTO_SOURCES } from "../photoSources";
import { cameraForAspect } from "../scene/worldLayout";
import { closeStacksPanel, openStacksPanel, useStacks } from "../store";

/** Which edges of a scroll container have content past them. Mirrors the
 * AIC platform's pattern of only fading an edge that actually continues, so
 * a short placard gets no phantom fade. */
function useScrollEdges(
  ref: React.RefObject<HTMLDivElement | null>,
  /** Re-attach when the scroller comes into existence. The mobile sheet is
   * inside an AnimatePresence, so its scroller is absent on the first render
   * of the component that owns this hook — and with only the (stable) ref in
   * the dep list the effect ran once against null and never again, so the
   * mobile fades never appeared at all. */
  attached = true,
) {
  const [edges, setEdges] = useState({ top: false, bottom: false });
  useEffect(() => {
    const el = ref.current;
    if (!el || !attached) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const top = scrollTop > 4;
      const bottom = scrollTop + clientHeight < scrollHeight - 4;
      setEdges((prev) =>
        prev.top === top && prev.bottom === bottom ? prev : { top, bottom },
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    // Panel bodies lazy-mount on first activation and the lifting heatmap
    // arrives async, so the children present at mount are not the children
    // that decide whether this thing scrolls. Without the subtree watch the
    // fade never appears on exactly the long placards that need it.
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref, attached]);
  return edges;
}

/** Every element in the placard that wants to be a frosted surface. The
 * shared sections mark theirs with a `backdrop-blur-*` utility; PlacardCard
 * below joins them by carrying the same class. */
const PLATE_SELECTOR = '[class*="backdrop-blur"]';
/** The things in a placard that actually do something. A card only gets
 * hover feedback when it resolves to one of these — a surface that isn't a
 * door shouldn't act like one. */
const HIT_SELECTOR = 'a[href], button, [role="button"]';
/** How far the content dissolves at each edge of the scroll viewport. */
const FADE_PX = 34;
/** How far outside the scroll viewport a plate keeps its blur, so one never
 * has to appear on the same frame it becomes visible. */
const CULL_MARGIN = 120;

/** The translation a card is currently carrying, in px. Only the hover lift
 * ever puts one there, but reading the computed matrix rather than assuming
 * the token means a measurement taken mid-transition subtracts the exact
 * amount that frame is showing. */
function liftOf(hit: Element | null): [number, number] {
  if (!hit) return [0, 0];
  const t = getComputedStyle(hit).transform;
  if (!t || t === "none") return [0, 0];
  try {
    const m = new DOMMatrixReadOnly(t);
    return [m.e, m.f];
  } catch {
    return [0, 0];
  }
}

type Plate = {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
};

/** The frosted plates, rendered BEHIND the scroller.
 *
 * A card cannot both blur the scene behind it and fade out at a scroll edge.
 * That is measured, not assumed (scratchpad `bd-matrix`): a `mask-image` or
 * `opacity < 1` anywhere in a card's ancestry — or on the card itself —
 * makes a backdrop root, and the card's `backdrop-filter` then samples an
 * empty backdrop and renders translucent but perfectly sharp. Three earlier
 * attempts died on exactly that, each time looking like a CSS typo rather
 * than a spec rule.
 *
 * So the two jobs are split across two sibling layers sharing one geometry:
 *
 *   • the SCROLLER carries the gradient mask and the readable content, with
 *     its cards' own fill and backdrop-filter stripped (they cannot work);
 *   • THIS layer sits behind it, outside the mask, and paints one frosted
 *     plate per card, mirroring that card's rect and riding its scrollTop.
 *
 * The plates clip rather than fade — nothing can do both — which is why the
 * placard now spans the full viewport height: the clip edge lands off-screen
 * where there is nothing to see. `overflow: hidden` is the clip because
 * `clip-path` also kills backdrop-filter (same matrix).
 *
 * Measuring rather than duplicating the subtree keeps one copy of the DOM,
 * so the lifting heatmap and the deferred sections don't mount twice.
 *
 * The split is also why hover feedback lives here rather than in CSS on the
 * card: a card and its glass are one object drawn in two places, so anything
 * that moves one has to move the other on the same frame. This component
 * owns that pairing — it marks the clickable card and mirrors the pointer
 * state onto the plate behind it. */
function BlurPlates({
  scrollRef,
  mounted,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  mounted: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [plates, setPlates] = useState<Plate[]>([]);
  /** Parallel to `plates`: the clickable element each plate sits behind, or
   * null for a card that is only a surface. */
  const hitsRef = useRef<(Element | null)[]>([]);
  const pointerRef = useRef<{
    hover: Element | null;
    focus: Element | null;
    press: Element | null;
  }>({ hover: null, focus: null, press: null });
  /** Plate geometry and the scroller's height, mirrored out of state so the
   * scroll handler can decide what is on screen with arithmetic alone — it
   * must never read layout, which is the whole reason scrolling is cheap. */
  const geomRef = useRef<{ plates: Plate[]; viewport: number }>({
    plates: [],
    viewport: 0,
  });

  /** Push the pointer state onto the plates as data-attributes. Written
   * straight to the DOM rather than through React state on purpose: the card
   * lifts from CSS `:hover` the instant the event fires, and a render round
   * trip would start the plate's identical transition a frame or two later —
   * the two layers have to leave together or the glass visibly peels off the
   * text it is backing. */
  const paint = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const { hover, focus, press } = pointerRef.current;
    Array.from(layer.children).forEach((el, i) => {
      const hit = hitsRef.current[i] ?? null;
      const set = (name: string, on: boolean) =>
        on ? el.setAttribute(name, "") : el.removeAttribute(name);
      set("data-hover", !!hit && hit === hover);
      set("data-focus", !!hit && hit === focus);
      set("data-press", !!hit && hit === press);
    });
  }, []);
  // A re-measure can add plates; repaint once they exist so a card the
  // pointer is already resting on doesn't come back unlit.
  useEffect(paint, [plates, paint]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !mounted) return;
    let raf = 0;
    let tagged = new Set<Element>();
    const observed = new WeakSet<Element>();
    const ro = new ResizeObserver(() => schedule());

    const measure = () => {
      raf = 0;
      // Pointer state can outlive the elements it points at — a hot update or
      // any re-render that replaces a card leaves these refs holding detached
      // nodes, and nothing fires a pointer event to clear them because the
      // pointer never moved.
      const ptr = pointerRef.current;
      if (ptr.hover && !ptr.hover.isConnected) ptr.hover = null;
      if (ptr.press && !ptr.press.isConnected) ptr.press = null;
      if (ptr.focus && !ptr.focus.isConnected) ptr.focus = null;
      const all = Array.from(el.querySelectorAll<HTMLElement>(PLATE_SELECTOR));
      const base = el.getBoundingClientRect();
      // Plate geometry is only valid while the placard is painted at its
      // layout size. Under an ancestor transform every card's rect is scaled
      // but the plate layer it feeds is not, so the error grows with distance
      // down the list — the far end of a long panel ends up a whole card out
      // of register. ResizeObserver cannot catch this (it reports layout
      // boxes, which a transform does not touch), so check it here and wait
      // for the transform to settle instead.
      if (el.clientWidth && Math.abs(base.width / el.clientWidth - 1) > 0.002) {
        raf = requestAnimationFrame(measure);
        return;
      }
      const rects = new Map(all.map((c) => [c, c.getBoundingClientRect()]));
      // Only outermost surfaces — a plate per language pill or play badge
      // would frost the frosting. The test is GEOMETRIC, not DOM ancestry:
      // several cards draw their surface as an `absolute inset-0` SIBLING of
      // their content, so the pill is not a descendant of the marker that
      // covers it and a `contains` filter let both through.
      const cards = all.filter((c) => {
        const r = rects.get(c)!;
        return !all.some((o) => {
          if (o === c) return false;
          const q = rects.get(o)!;
          return (
            q.left <= r.left + 1 &&
            q.top <= r.top + 1 &&
            q.right >= r.right - 1 &&
            q.bottom >= r.bottom - 1 &&
            q.width * q.height > r.width * r.height
          );
        });
      });
      // Cards resize without mutating: a font swap, an image decoding, a
      // descendant-only reflow. Observing each measured card is what catches
      // those; the scroller's own box never changes.
      for (const c of cards) {
        if (!observed.has(c)) {
          observed.add(c);
          ro.observe(c);
        }
      }
      // Resolve each card to the thing you can actually click and mark it,
      // so the CSS below can lift exactly those and nothing else. Marking is
      // a class write, which this file's MutationObserver deliberately does
      // not watch (childList/subtree only), so it can't feed back into a
      // re-measure loop.
      const hits = cards.map((c) => c.closest(HIT_SELECTOR));
      const nextTagged = new Set<Element>();
      for (const h of hits) {
        if (!h) continue;
        h.classList.add("placard-hit");
        nextTagged.add(h);
      }
      for (const old of tagged) {
        if (!nextTagged.has(old)) old.classList.remove("placard-hit");
      }
      tagged = nextTagged;
      hitsRef.current = hits;
      const next: Plate[] = cards.map((c, i) => {
        const r = rects.get(c)!;
        // Subtract the hover lift. A lifted card's rect includes its own
        // transform, so recording it verbatim would store a RAISED resting
        // position — and since the plate re-applies the same lift itself via
        // [data-hover], the two would then compound and the glass would sit
        // permanently high once the pointer left. Read off the live matrix
        // rather than the -3px token so a measurement landing mid-transition
        // gets the fractional value it actually has.
        const [liftX, liftY] = liftOf(hits[i] ?? null);
        return {
          top: r.top - base.top + el.scrollTop - liftY,
          left: r.left - base.left - liftX,
          width: r.width,
          height: r.height,
          radius: getComputedStyle(c).borderRadius,
        };
      });
      setPlates((prev) =>
        prev.length === next.length &&
        prev.every(
          (p, i) =>
            Math.abs(p.top - next[i]!.top) < 0.5 &&
            Math.abs(p.left - next[i]!.left) < 0.5 &&
            Math.abs(p.width - next[i]!.width) < 0.5 &&
            Math.abs(p.height - next[i]!.height) < 0.5,
        )
          ? prev
          : next,
      );
      geomRef.current = { plates: next, viewport: base.height };
      // Covers the bail-out branch above, where the geometry is unchanged so
      // no render (and no effect) follows to repaint the plates.
      paint();
      cull();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    /** Only the plates you can actually see carry a backdrop-filter.
     *
     * Every plate is its own backdrop root, so a long placard asks the
     * compositor to snapshot and blur the scene N times a frame — on Musings
     * that is nine 80px blurs, of which four or five are scrolled out of
     * sight. Clipping them via `overflow: hidden` does not reliably stop
     * that work; dropping the filter does.
     *
     * Deliberately arithmetic-only, off cached geometry: this runs on the
     * scroll event, where a single `clientHeight` read would reintroduce the
     * forced layout the whole two-layer split exists to avoid. */
    const cull = () => {
      const layer = layerRef.current;
      if (!layer) return;
      const { plates: geom, viewport } = geomRef.current;
      if (!viewport) return;
      const top = el.scrollTop;
      const kids = layer.children;
      for (let i = 0; i < kids.length; i++) {
        const g = geom[i];
        if (!g) continue;
        const on =
          g.top < top + viewport + CULL_MARGIN &&
          g.top + g.height > top - CULL_MARGIN;
        const node = kids[i]!;
        if (on === !node.hasAttribute("data-off")) continue;
        if (on) node.removeAttribute("data-off");
        else node.setAttribute("data-off", "");
      }
    };
    // Scroll only moves the layer — one transform, no re-measure, no React.
    const sync = () => {
      if (layerRef.current)
        layerRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
      cull();
    };

    // Map an event back to the plate it belongs to. `closest` alone isn't
    // enough: a link can sit inside a card, and it's the card's plate that
    // should answer, so keep walking outward until one of the measured hits
    // matches.
    const findHit = (node: EventTarget | null) => {
      let hit = node instanceof Element ? node.closest(HIT_SELECTOR) : null;
      while (hit) {
        if (hitsRef.current.includes(hit)) return hit;
        hit = hit.parentElement?.closest(HIT_SELECTOR) ?? null;
      }
      return null;
    };
    // One delegated `pointerover` rather than a listener per card: it fires
    // on every boundary the pointer crosses, so moving from a card into the
    // gap between cards resolves to null and clears the state for free.
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // no sticky hover after a tap
      pointerRef.current.hover = findHit(e.target);
      paint();
    };
    const onLeave = () => {
      pointerRef.current.hover = null;
      paint();
    };
    const onDown = (e: PointerEvent) => {
      pointerRef.current.press = findHit(e.target);
      paint();
    };
    const onUp = () => {
      if (!pointerRef.current.press) return;
      pointerRef.current.press = null;
      paint();
    };
    // Keyboard gets the same acknowledgement as the pointer — `:focus-visible`
    // on the target is what keeps it from firing on a mouse click too.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      const visible =
        target instanceof Element && target.matches(":focus-visible");
      pointerRef.current.focus = visible ? findHit(target) : null;
      paint();
    };
    const onFocusOut = () => {
      pointerRef.current.focus = null;
      paint();
    };

    schedule();
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    el.addEventListener("pointerover", onOver);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    // Released outside the placard still counts as released.
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    ro.observe(el);
    // Section bodies mount lazily and the lifting heatmap arrives async, so
    // watch the subtree rather than just the scroller's own box.
    //
    // Deliberately NOT watching `style`: TiltCard writes an inline transform
    // on every mouse move, so a style filter fired a full re-measure — a
    // selector scan plus getBoundingClientRect and getComputedStyle per card
    // — on every frame the pointer was over the placard. Structure changes
    // are what move plates; a hover tilt is not a structure change, and pure
    // size changes are already covered by the ResizeObserver above.
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });
    // A webfont swap reflows every card without touching the DOM and without
    // necessarily resizing the boxes the ResizeObserver is watching, and the
    // site's serif loads with font-display: block — so the first measurement
    // can easily land on fallback metrics. One extra pass when the real faces
    // are in costs nothing and closes the last gap where plates could be
    // measured against a layout that no longer exists.
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) schedule();
    });
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("scroll", sync);
      el.removeEventListener("pointerover", onOver);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      for (const old of tagged) old.classList.remove("placard-hit");
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollRef, mounted, paint]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div ref={layerRef} className="placard-plates absolute inset-0">
        {plates.map((p, i) => (
          <div
            key={i}
            className="placard-plate"
            style={{
              top: p.top,
              left: p.left,
              width: p.width,
              height: p.height,
              borderRadius: p.radius,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Desktop placard. The containing panel is gone — a blurred panel holding
 * blurred cards was a box on a box (owner at browse) — so each content
 * block keeps its own single blurred surface and the headers sit directly
 * on the scene. Losing the container is also what buys the extra width.
 *
 * The wrapper deliberately carries NOTHING that would create a backdrop
 * root (no mask, no filter, and opacity only while crossfading), because
 * any of those would silently disable `backdrop-filter` on every card
 * inside it — translucent, unblurred, which is exactly the bug the first
 * cut shipped. The edge fades are siblings of the scroller for the same
 * reason. */
function Panel({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(scrollRef, mounted);
  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);
  // Only fade an edge that actually continues, so a short placard gets no
  // phantom dissolve — the AIC platform's rule, and the reason both edges
  // live in ONE gradient with four conditional stops rather than two masks.
  const mask = `linear-gradient(to bottom, ${
    edges.top ? `transparent 0, black ${FADE_PX}px` : "black 0"
  }, ${
    edges.bottom
      ? `black calc(100% - ${FADE_PX}px), transparent 100%`
      : "black 100%"
  })`;
  return (
    <div
      aria-hidden={!active}
      // aria-hidden alone is a trap: the six inactive placards stay in the
      // tab order, so keyboard focus walks into content that is invisible
      // AND announced as hidden. `inert` is what actually removes a subtree
      // from focus and the a11y tree. It matters more now that the About
      // placard carries permanently sr-only photo-source links.
      inert={!active}
      // Fade-out-then-in: the entering placard waits for the leaving one —
      // simultaneous crossfade rendered as text-over-text mush (audit §2.5).
      // Full viewport height on purpose: the plates behind clip instead of
      // fading, so the clip has to happen off-screen. The vertical padding
      // is what keeps content off the very edges of the glass.
      className={`absolute inset-y-0 right-0 w-full transition-opacity duration-200 ${
        active
          ? "pointer-events-auto opacity-100 delay-200"
          : "pointer-events-none opacity-0 delay-0"
      }`}
    >
      <BlurPlates scrollRef={scrollRef} mounted={mounted} />
      <div
        ref={scrollRef}
        data-stacks-scrollable
        // aria-hidden is duplicated from the wrapper on purpose: the input
        // bridge and the scroll-isolation gate both look up the ACTIVE
        // scroller by this attribute pair.
        aria-hidden={!active}
        // Absolute padding, not the 12vh this used to be. Viewport-relative
        // padding on a scroller is dead scroll range that grows with the
        // window: at 952px tall, 12vh was 114px at each end — 24% of a
        // viewport height of empty scrolling, and 30% on Projects, which
        // also carries a heading above its first card. It never showed at
        // 1440x900 because it is height-relative, not width-relative.
        //
        // 64px was still too much. Padding lands in scrollHeight, so it is
        // scroll range containing nothing: measured 128px of empty travel on
        // EVERY scrollable unit, which is 31% of the total range on Systems
        // at a 683px-tall window. The floor is FADE_PX (34) — content that
        // begins any closer starts inside its own dissolve — so 40px is the
        // smallest honest value, and it halves the dead range.
        //
        // `overscroll-none`, not `-contain`: contain stops scroll CHAINING to
        // the page but leaves the macOS elastic bounce intact, so hitting the
        // end of a section rubber-banded the whole column against that empty
        // padding. Chaining is already handled a layer up — ScrollBridges'
        // wheel listener bails on any target inside [data-stacks-scrollable] —
        // so nothing here depends on contain's chaining behaviour.
        className="stacks-scroll placard-scroll relative h-full overflow-y-auto overscroll-none py-10 pl-1 pr-3"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {/* Short placards stay optically centred — the panel is full-height
            only so the plate layer's clip lands off-screen, and letting a
            two-line card sit pinned to the top of the glass would make the
            column look top-heavy on every unit that isn't Systems. */}
        <div className="flex min-h-full flex-col justify-center">
          {mounted ? children : null}
        </div>
      </div>
    </div>
  );
}

/** One surface for a content block, matching the card the shared sections
 * draw for themselves. About and Books build their bodies here rather than
 * reusing a site section, so they'd otherwise be the only placards with no
 * surface at all.
 *
 * It keeps the `backdrop-blur` utility even though the CSS below strips it:
 * that class is the marker BlurPlates looks for, and the border-radius here
 * is what the plate copies. */
function PlacardCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] p-5 backdrop-blur-[24px]">
      {children}
    </div>
  );
}

function StatBlock({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xl font-semibold text-foreground">{value}</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
    </div>
  );
}

/** Compact library placard — the 3D shelf carries the covers, so this panel
 * holds the numbers and the door to the full site. */
function BooksPlacard({ data }: { data: StacksData }) {
  const bookHref =
    process.env.NODE_ENV === "production"
      ? "https://books.chappyasel.com"
      : devSubdomainUrl("books");
  const { bookStats, reading } = data;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
        <BooksIcon weight="duotone" className="size-6 shrink-0" />
        Book Notes
      </h2>
      <div className="flex justify-around gap-1">
        <StatBlock
          value={bookStats.total.toString()}
          label="Books"
          icon={<BookOpenIcon className="size-3.5" weight="bold" />}
        />
        <StatBlock
          value={bookStats.perYear?.toFixed(1) ?? "—"}
          label="Per Year"
          icon={<CalendarBlankIcon className="size-3.5" weight="bold" />}
        />
        <StatBlock
          value={bookStats.avgDays ? `${bookStats.avgDays.toFixed(1)}d` : "—"}
          label="Avg Read"
          icon={<ClockIcon className="size-3.5" weight="bold" />}
        />
        <StatBlock
          value={bookStats.pagesPerDay?.toFixed(1) ?? "—"}
          label="Pages / Day"
          icon={<BookOpenTextIcon className="size-3.5" weight="bold" />}
        />
      </div>
      {reading && (
        <p className="text-sm text-muted-foreground">
          Now reading <em>{reading.title}</em>.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Tap a cover on the shelf for my notes, or browse the whole library at{" "}
        <Link className="font-semibold hover:underline" href={bookHref}>
          books.chappyasel.com
        </Link>
        .
      </p>
    </div>
  );
}

/* ── Where the room stops, and therefore where the sheet starts ──────────
 *
 * Portrait frames the room badly. The camera is built around a landscape
 * unit, so on a 390x844 phone the bookcase finishes about two thirds of the
 * way down and the rest is bare floor — the owner's "it's hard to see the
 * bottom part", which is really "there is nothing down there". That void is
 * what the peek sheet fills, so the peek height is not a taste number. It is
 * the void, measured.
 *
 * The projection below is exact rather than eyeballed. CameraRig parks the
 * camera at (unitX, pose.y, pose.z) and aims it at (unitX, LOOK.y, LOOK.z),
 * so camera and target share a vertical plane and the angle between the view
 * axis and the ray to any point on that plane is simply the difference of two
 * pitches. A perspective camera then maps an angle theta off its axis to
 * tan(theta) / tan(halfFov) of a half-viewport.
 *
 * `pose` comes from cameraForAspect, which is the same function the rig uses,
 * so this follows the camera instead of assuming portrait — a landscape phone
 * (still under the md breakpoint, so still on the sheet) gets the wide pose's
 * much smaller void and lands on the floor clamp below.
 */

/** The resting look target. CameraRig damps look.y toward -0.08 with the
 * pointer centred, and its z is fixed. */
const LOOK = { y: -0.08, z: -0.2 };
/** Where the bookcase stops. Its straps run down to the ground plane at
 * y -1.115 and stand on a plinth foot there, and the strap group sits at
 * z -0.32 (scene/primitives.tsx, the Shelf frame). The NEAR depth is the one
 * to measure against: the odd units are pushed back to z -0.55, which only
 * lifts their feet higher up the frame, so clearing the near ones clears
 * every unit rather than most of them. */
const FOOT = { y: -1.115, z: -0.32 };
/** A sheet shorter than this is not worth showing — it would hold a title and
 * a clipped line. Below it the sheet covers a little shelf instead, which is
 * the better trade. */
const PEEK_MIN_PX = 160;
/** And it never takes more than this much of the screen whatever the
 * arithmetic says, because the room is the point of the page. */
const PEEK_MAX_FRACTION = 0.45;
/** Header height: the grabber block (16) plus the title row (h-11). Used to
 * work out whether the peek window actually has content past its bottom
 * edge, so a short placard gets no phantom fade. */
const SHEET_HEADER_PX = 60;

/** Height of the empty floor below the bookcase, in px — the peek height. */
function peekHeightFor(width: number, height: number): number {
  const pose = cameraForAspect(width / height);
  const pitch = Math.atan2(pose.y - LOOK.y, pose.z - LOOK.z);
  const toFoot = Math.atan2(pose.y - FOOT.y, pose.z - FOOT.z);
  const halfFov = ((pose.fov / 2) * Math.PI) / 180;
  // Fraction of the viewport height, from the top, where the feet land:
  // 66.8% at 390x844, against ~570px measured off a screenshot versus 563px
  // predicted — the difference is the camera's slow vertical bob (±0.03).
  const foot = 0.5 + (Math.tan(toFoot - pitch) / Math.tan(halfFov)) * 0.5;
  return Math.round(
    Math.min(
      Math.max(height * (1 - foot), PEEK_MIN_PX),
      height * PEEK_MAX_FRACTION,
    ),
  );
}

/** Viewport height and the peek height derived from it, re-measured on
 * resize and orientation change. Measured rather than declared in `dvh`
 * because the sheet has to agree with the CANVAS, and the canvas takes its
 * height from the same `fixed inset-0` box this reads. */
function useSheetMetrics() {
  const [metrics, setMetrics] = useState<{
    vw: number;
    vh: number;
    peek: number;
  } | null>(null);
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Width matters as much as height: cameraForAspect switches poses at
      // 0.75, and the two poses put the bookcase's feet in very different
      // places.
      setMetrics((prev) =>
        prev?.vw === vw && prev.vh === vh
          ? prev
          : { vw, vh, peek: peekHeightFor(vw, vh) },
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return metrics;
}

/** How far a touch has to travel before it is a drag rather than a tap. */
const DRAG_ARM_PX = 6;
/** Travel that commits the sheet to the next detent in that direction. */
const DRAG_STEP_PX = 72;
/** px/ms that commits regardless of distance. 0.6 is 600 px/s, about the
 * slowest thing that still reads as a flick rather than a placement. */
const FLING = 0.6;
/** The harder fling that skips a detent — expanded straight out to the chip.
 * Measured before assuming: an unhurried 180px pull down the sheet runs at
 * ~1.8 px/ms, so the first cut's 1.6 sent an ordinary collapse all the way to
 * dismissed. A skip has to be an obvious throw, and it also has to travel far
 * enough to mean it, hence the distance floor as well. */
const FLING_SKIP = 2.6;
const FLING_SKIP_MIN_PX = 120;
/** Minimum gap between velocity samples, and the pause after which the last
 * one is stale. */
const VELOCITY_SAMPLE_MS = 6;
const VELOCITY_STALE_MS = 100;
const SHEET_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 42,
  mass: 0.9,
};

/** Mobile bottom sheet with three detents.
 *
 *   PEEK       resting default. The sheet sits in the floor void under the
 *              bookcase, showing the unit title and the first slice of its
 *              placard, and the room above it stays fully live.
 *   EXPANDED   full height, scrollable.
 *   DISMISSED  off-screen, leaving the chip — the way to get the sheet
 *              entirely out of the room.
 *
 * Only EXPANDED is a store state. Peek and dismissed both map to the store's
 * `panelState: "closed"`, and that is deliberate rather than a shortcut:
 * `panelBusy()` freezes travel and every input bridge, and peek must not
 * freeze anything. The sheet is resting in space the room was not using, so
 * swiping the world above it still travels. `dismissed` is therefore local
 * state, and the store keeps meaning exactly what it meant before — "the
 * panel owns the viewport".
 *
 * The sheet is always full-height and always mounted; the three detents are
 * three values of a translateY. That is what lets one continuous drag run
 * from expanded to dismissed, and it keeps the text from reflowing on every
 * frame of the transition the way an animated height would.
 *
 * WHICH GESTURE WINS. Three vertical drags compete on a phone:
 *
 *   1. ScrollBridges re-maps a vertical swipe into lateral world travel. It
 *      listens on drei's scroll container, which is NOT an ancestor of this
 *      sheet, so a touch that starts on the sheet never reaches it — the two
 *      are separated by geometry, not by a guard. Above the sheet the swipe
 *      travels; on the sheet it does not. That is also why peek has to leave
 *      panelState alone: the freeze is what would break travel above.
 *   2. The inner scroller. In PEEK it is `overflow: hidden`, so there is
 *      nothing in the sheet that could want a vertical drag and the sheet
 *      takes all of them: up expands, down dismisses. In EXPANDED the
 *      scroller wins, with one exception.
 *   3. That exception is the pull-down, which is the gesture this file
 *      already had: a downward drag that BEGINS with the content at
 *      scrollTop 0. It used to dismiss; it now collapses to peek, and only a
 *      long pull or a hard fling carries through to dismissed. Arming on
 *      scrollTop at touchstart rather than during the move is what keeps it
 *      from stealing the tail of a flick that scrolled up to the top.
 *
 * Close paths: the chevron, the X, a downward drag, and browser back — the
 * ones that leave EXPANDED all funnel through history.back() → popstate →
 * "closing", so the pushed history entry is always consumed. */
function MobilePanel({
  bodies,
}: {
  bodies: Record<(typeof UNITS)[number]["slug"], React.ReactNode>;
}) {
  const activeUnit = useStacks((s) => s.activeUnit);
  const modalOpen = useStacks((s) => s.modalOpen);
  const panelState = useStacks((s) => s.panelState);
  const unit = UNITS[activeUnit]!;
  const expanded = panelState === "opening" || panelState === "open";
  const [dismissed, setDismissed] = useState(false);
  const metrics = useSheetMetrics();

  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Mobile keeps its sheet — an opaque surface is what makes the text
  // readable over a rendered room — but it loses the inner cards and gains
  // the same edge fade as desktop, so the two form factors read as one
  // design rather than two.
  const edges = useScrollEdges(scrollRef, expanded);

  // One scroller serves seven placards and all three detents, so its
  // scrollTop outlives both the document in it and the pose it was set in.
  // Reset it whenever what is being read changes identity:
  //
  //  • A UNIT change swaps the body for a different document, where the old
  //    offset points at nothing in particular. It also clamps silently —
  //    travelling from Musings (3310px of content) to Systems (1078px) left
  //    the reader 295px down a placard they never opened.
  //  • Leaving EXPANDED, because showing the title and the opening lines is
  //    the whole job of peek. Collapsing at scrollTop 485 put the middle of a
  //    paragraph in the peek window with no heading above it.
  //
  // The cost is that re-expanding starts at the top rather than where you
  // left off, and that is the deliberate half of the trade: peek is a window
  // onto this same scroller, so it cannot both hold your place and be a
  // preview of the opening. Peek being readable at a glance wins — it is the
  // state the visitor is in by default.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [expanded, unit.slug]);

  // The one number the whole sheet is positioned by: 0 is expanded, and the
  // sheet is full height, so the peek and dismissed detents are just further
  // down the same axis.
  const vh = metrics?.vh ?? 0;
  const peek = metrics?.peek ?? 0;
  // Starts off the bottom of the screen, so the sheet's first move is to rise
  // into peek with the room rather than to drop out of a full-screen pose it
  // was never in.
  const y = useMotionValue(
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  // A book modal takes the viewport, so the sheet gets out of its way rather
  // than sitting behind it at z-40.
  const hidden = dismissed || modalOpen;
  const restY = expanded && !modalOpen ? 0 : hidden ? vh : vh - peek;
  const restRef = useRef(restY);
  restRef.current = restY;
  const settle = useCallback(() => {
    animate(y, restRef.current, SHEET_SPRING);
  }, [y]);
  useEffect(() => {
    // Before the viewport is measured every detent is zero, which is the
    // expanded pose — animating to it would flash a full-screen sheet.
    if (metrics) settle();
  }, [metrics, restY, settle]);

  // Opening from anywhere lands on expanded, so a unit tapped in the room
  // while the sheet was dismissed comes back to peek when it closes rather
  // than vanishing again.
  useEffect(() => {
    if (expanded) setDismissed(false);
  }, [expanded]);

  // "opening" and "closing" are the intervals where the sheet is between
  // detents, and they used to be resolved by framer — onLayoutAnimationComplete
  // promoted "opening", AnimatePresence's onExitComplete settled "closing".
  // Neither fires now: the sheet no longer morphs out of the chip and no
  // longer unmounts to collapse. So the transitional states are resolved on
  // the clock instead, at roughly the spring's settling time. Doing it here
  // rather than off the animation's finished promise keeps it deterministic —
  // a promise that a resize or a second gesture interrupts would strand
  // panelState mid-transition, and travel is frozen the whole time it is.
  useEffect(() => {
    if (panelState !== "opening" && panelState !== "closing") return;
    const settled = panelState === "opening" ? "open" : "closed";
    const timeout = setTimeout(() => {
      const s = useStacks.getState();
      if (s.panelState === panelState) s.setPanelState(settled);
    }, 280);
    return () => clearTimeout(timeout);
  }, [panelState]);

  // Widening past the md breakpoint with the panel up strands the frozen
  // travel state — fold the panel immediately.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches && useStacks.getState().panelState !== "closed") {
        useStacks.getState().setPanelState("closed");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Each of these can refuse — openStacksPanel bails while a modal is up or
  // while a previous close is still unwinding, closeStacksPanel bails unless
  // the sheet is actually expanded. A refusal leaves `restY` where it was, so
  // nothing would re-run the settle effect and a half-finished drag would be
  // left stranded mid-screen. Spring it back by hand in exactly that case.
  const expand = useCallback(() => {
    setDismissed(false);
    const before = useStacks.getState().panelState;
    openStacksPanel();
    if (useStacks.getState().panelState === before) settle();
  }, [settle]);
  const collapse = useCallback(() => {
    setDismissed(false);
    closeStacksPanel();
    if (useStacks.getState().panelState === "closed") settle();
  }, [settle]);
  const dismiss = useCallback(() => {
    setDismissed(true);
    closeStacksPanel(); // no-op unless we are leaving expanded
  }, []);

  // The sheet header names the unit. The desktop dock never did, so nothing
  // caught that four of the seven bodies open with a heading of their own
  // saying exactly the same thing — Book Notes, Featured Talks, Projects and
  // Musings each printed their title twice, one line apart. The other three
  // must not be touched: Training opens on "Weightlifting" and Systems on
  // "Personal Operating Manual", which are real sub-titles, and About has no
  // heading at all.
  //
  // Hence a text match rather than "hide the first heading". Marking the node
  // and hiding it from CSS also leaves the body's own markup alone, which
  // matters because these headings come from the shared site sections that
  // the desktop panel still renders in full.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const label = unit.label.trim().toLowerCase();
    const apply = () => {
      for (const h of el.querySelectorAll("h1, h2")) {
        h.toggleAttribute(
          "data-dup-title",
          (h.textContent ?? "").trim().toLowerCase() === label,
        );
      }
    };
    apply();
    // Bodies lazy-mount, so the heading is usually absent on the first pass.
    // Attributes are deliberately NOT watched: this writes one, and watching
    // them would feed the observer its own output.
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [unit.label]);

  // Only fade the peek window's bottom edge if the placard actually
  // continues past it — the same rule the scroll edges follow, and the
  // reason a two-line placard would get no phantom dissolve.
  const [peekOverflows, setPeekOverflows] = useState(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !peek) return;
    // Two elements in here are the full height of the scroller no matter what
    // is in them, and measuring either gives a number that can never be less
    // than the viewport it is being compared against:
    //   • the SCROLLER, because scrollHeight is floored at client height;
    //   • the BODY wrapper, because `min-h-full` is what centres a short
    //     placard when the sheet is expanded.
    // Both have been that bug already. So descend past the wrapper and
    // measure the real content, falling back to the scroller's own children
    // if the wrapper is not there.
    const contentOf = () => {
      const body = el.querySelector(".placard-body") ?? el;
      const kids = Array.from(body.children);
      if (!kids.length) return 0;
      // The content's own EXTENT, top to bottom — deliberately not measured
      // from the scroller's origin. Once the sheet is expanded the wrapper
      // centres a short placard, which would fold half the leading whitespace
      // into a from-the-origin measurement and flip this answer purely
      // because the sheet opened.
      let top = Infinity;
      let bottom = -Infinity;
      for (const k of kids) {
        const r = k.getBoundingClientRect();
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
      return bottom - top;
    };
    const update = () =>
      setPeekOverflows(contentOf() > peek - SHEET_HEADER_PX + 4);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const body = el.querySelector(".placard-body") ?? el;
    for (const child of Array.from(body.children)) ro.observe(child);
    // Bodies lazy-mount and the lifting heatmap arrives async, so the
    // children present now are not the ones that decide this.
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [peek, unit.slug]);

  // The drag. Hand-rolled and non-passive rather than framer's drag: framer
  // sets touch-action:none on the element it drags, which kills the inner
  // scroll outright.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !metrics) return;
    let startY = 0;
    let lastY = 0;
    // Velocity is sampled on its own clock rather than per move. Two touchmoves
    // can land in the same millisecond — a coalesced burst, or anything
    // dispatching them synchronously — and dividing by a sub-millisecond dt
    // turns a 24px step into hundreds of px/ms, which read as a throw and sent
    // an ordinary collapse straight out to the chip.
    let sampleY = 0;
    let sampleT = 0;
    let velocity = 0; // px/ms, positive downward
    let base = 0;
    let owned: boolean | null = null; // null until the drag arms
    let fromScroller = false;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      y.stop();
      startY = lastY = sampleY = t.clientY;
      sampleT = e.timeStamp || performance.now();
      velocity = 0;
      owned = null;
      base = y.get();
      // Resolved once, at the start: whether the scroller is at its top is a
      // property of the gesture's origin, not of the frame it is asked in.
      const target = e.target;
      fromScroller =
        target instanceof Element &&
        !!target.closest("[data-stacks-scrollable]") &&
        (scrollRef.current?.scrollTop ?? 0) <= 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY;
      if (owned === null) {
        if (Math.abs(dy) < DRAG_ARM_PX) return;
        // Peek has no scroller to compete with; expanded hands everything to
        // the scroller except a pull-down that began at the top.
        const inScroller =
          e.target instanceof Element &&
          !!e.target.closest("[data-stacks-scrollable]");
        owned = !expanded || !inScroller || (dy > 0 && fromScroller);
      }
      if (!owned) return;
      e.preventDefault();
      const now = e.timeStamp || performance.now();
      // 6ms is under one frame at 120Hz, so a real touch stream still samples
      // on every move while a same-tick burst samples on none of them.
      if (now - sampleT >= VELOCITY_SAMPLE_MS) {
        velocity = (t.clientY - sampleY) / (now - sampleT);
        sampleY = t.clientY;
        sampleT = now;
      }
      lastY = t.clientY;
      const next = base + dy;
      // Above full height there is nothing left to reveal, so resist.
      y.set(next < 0 ? next * 0.25 : next);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!owned) {
        owned = null;
        return;
      }
      owned = null;
      // A finger that came to rest before lifting placed the sheet, it did not
      // throw it — so the velocity from before the pause must not carry.
      const end = e.timeStamp || performance.now();
      if (end - sampleT > VELOCITY_STALE_MS) velocity = 0;
      const dy = lastY - startY;
      const committed = Math.abs(dy) > DRAG_STEP_PX || Math.abs(velocity) > FLING;
      if (!committed) {
        settle(); // stayed put; spring back to where it was
        return;
      }
      if (dy < 0) {
        // Nothing above peek to go to, either because the sheet is already
        // full height or because the placard fits in the peek window and the
        // chevron is hidden for the same reason.
        if (expanded || !peekOverflows) settle();
        else expand();
        return;
      }
      // Downward. From expanded a long pull or a hard throw skips peek and
      // goes straight out, which is what a flick off a full sheet means.
      const skip =
        dy > metrics.vh * 0.45 ||
        (velocity > FLING_SKIP && dy > FLING_SKIP_MIN_PX);
      if (expanded && !skip) collapse();
      else dismiss();
    };
    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    panel.addEventListener("touchend", onTouchEnd, { passive: true });
    panel.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [metrics, expanded, peekOverflows, y, settle, expand, collapse, dismiss]);

  const sheetMask = `linear-gradient(to bottom, ${
    edges.top ? `transparent 0, black ${FADE_PX}px` : "black 0"
  }, ${
    edges.bottom
      ? `black calc(100% - ${FADE_PX}px), transparent 100%`
      : "black 100%"
  })`;

  // One frame of nothing rather than one frame of a full-screen sheet: the
  // detents are derived from a measured viewport, and before that measurement
  // every one of them is zero.
  if (!metrics) return null;

  return (
    <div className="md:hidden">
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="dim"
            className="fixed inset-0 z-30 bg-background/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
      <motion.div
        ref={panelRef}
        data-stacks-panel
        data-sheet={expanded ? "expanded" : hidden ? "dismissed" : "peek"}
        style={{ y }}
        // Square at full height, a sheet edge everywhere else — rounded
        // corners at the very top of the screen would frame two slivers of
        // room above a panel that is meant to have replaced it.
        animate={{
          borderTopLeftRadius: expanded ? 0 : 16,
          borderTopRightRadius: expanded ? 0 : 16,
        }}
        transition={SHEET_SPRING}
        // Never unmounted, only translated — see the header comment. Off the
        // bottom it must also be out of the tab order and out of the way of
        // taps on the room, which `inert` and pointer-events do between them.
        inert={hidden}
        className={`fixed inset-0 z-40 flex flex-col border-t border-foreground/[0.07] bg-background/95 shadow-[0px_-6px_28px_2px_rgba(0,0,0,0.13)] backdrop-blur-xl ${
          hidden ? "pointer-events-none" : "pointer-events-auto"
        }`}
      >
        {/* The grabber is the whole discoverability story for the drag, and
            it is why the sheet does not need a caption explaining itself. */}
        <div className="flex h-4 items-start justify-center pt-2">
          <div aria-hidden className="h-1 w-9 rounded-full bg-foreground/20" />
        </div>
        <div className="flex h-11 items-center justify-between pl-5 pr-1">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            {unit.label}
          </h2>
          <div className="flex items-center">
            {/* No chevron on a placard that is already fully visible. Book
                Notes is 180px of content in a 220px peek window: offering to
                expand it promised more and delivered a card stranded in five
                sixths of an empty screen. `peekOverflows` is the same signal
                that decides the fade, which is the point — the affordance and
                the "there is more below" hint now cannot disagree. */}
            {(peekOverflows || expanded) && (
              <button
                type="button"
                aria-label={expanded ? "Collapse" : "Expand"}
                aria-expanded={expanded}
                onClick={expanded ? collapse : expand}
                className="flex size-11 items-center justify-center text-muted-foreground"
              >
                {expanded ? (
                  <CaretDownIcon className="size-5" weight="bold" />
                ) : (
                  <CaretUpIcon className="size-5" weight="bold" />
                )}
              </button>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={dismiss}
              className="flex size-11 items-center justify-center text-muted-foreground"
            >
              <XIcon className="size-5" weight="bold" />
            </button>
          </div>
        </div>
        {/* Mobile takes the same masked-scroller dissolve as desktop. It
            needs no plate layer: the sheet behind is the one blurred
            surface, so nothing inside it is asking for a backdrop. */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            // Only tagged while it can actually scroll. The attribute is what
            // ScrollBridges' wheel handler bails on, and leaving it on an
            // `overflow: hidden` element would deaden a third of the screen
            // to the wheel on a narrow desktop window for no reason.
            data-stacks-scrollable={expanded ? "" : undefined}
            // `overscroll-none` for the same reason as the desktop scroller:
            // contain leaves the elastic bounce in place. It matters more
            // here, because the pull-down arms at scrollTop 0 and a native
            // rubber-band at the top edge competes for the same drag.
            className={`stacks-scroll placard-scroll h-full overscroll-none px-5 pb-6 pt-3 font-serif text-muted-foreground ${
              expanded ? "overflow-y-auto" : "overflow-hidden"
            }`}
            style={
              expanded
                ? { maskImage: sheetMask, WebkitMaskImage: sheetMask }
                : undefined
            }
          >
            {/* Short placards sit centred once the sheet is at full height,
                which is the same thing the desktop dock does and for the same
                reason. Book Notes is 236px of content: pinned to the top of an
                844px sheet it left five sixths of the screen empty and read as
                a panel that had failed to load. Centred it reads as a short
                section, which is what it is.

                Only while EXPANDED. Peek must stay top-aligned — showing the
                title and the opening lines is its entire job — and on a tall
                placard `justify-center` is a no-op either way, since the
                content already exceeds the container. */}
            <div
              className={`placard-body flex min-h-full flex-col ${
                expanded ? "justify-center" : "justify-start"
              }`}
            >
              {bodies[unit.slug]}
            </div>
          </div>
          {/* The peek window's own bottom edge. It cannot be a mask on the
              scroller — the scroller runs on past the fold, and a mask is one
              of the three things that would kill the sheet's backdrop-filter
              anyway — so it is a sibling gradient sitting exactly on the
              fold. Placed in sheet coordinates: `peek` down from the sheet's
              top IS the bottom of the screen while peeking. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bg-gradient-to-t from-background to-transparent"
            style={{ top: peek - SHEET_HEADER_PX - FADE_PX, height: FADE_PX }}
            animate={{ opacity: expanded || !peekOverflows ? 0 : 1 }}
            transition={{ duration: 0.18 }}
          />
        </div>
      </motion.div>
      <AnimatePresence>
        {hidden && !modalOpen && (
          <motion.button
            key="chip"
            type="button"
            data-stacks-chip
            onClick={() => setDismissed(false)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto fixed inset-x-0 bottom-3 z-40 mx-auto flex h-11 w-fit max-w-[80vw] items-center gap-2 rounded-[22px] border border-foreground/[0.06] bg-background/85 px-4 font-serif text-sm text-foreground shadow-[0px_4px_24px_2px_rgba(0,0,0,0.10)] backdrop-blur"
          >
            <span className="truncate">{unit.label}</span>
            <CaretUpIcon className="size-3.5 shrink-0" weight="bold" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PlacardLayer({
  data,
  slots,
}: {
  data: StacksData;
  slots: StacksSlots;
}) {
  const activeUnit = useStacks((s) => s.activeUnit);
  const modalOpen = useStacks((s) => s.modalOpen);

  const bodies: Record<(typeof UNITS)[number]["slug"], React.ReactNode> = {
    about: (
      <PlacardCard>
        <div className="flex items-start justify-between">
          <div className="text-sm leading-6">{slots.aboutIntro}</div>
        </div>
        <div className="flex flex-col items-center gap-2 pt-4">
          {slots.contact}
        </div>
        {/* The four photographs in the room that link to their source post
            do it as raycast targets, and a canvas has no focus order and no
            accessible name — so those URLs exist nowhere a keyboard or a
            screen reader can reach them. This mirrors them into the DOM
            without putting anything on the glass. */}
        <nav aria-label="Photo sources" className="sr-only">
          <ul>
            {PHOTO_SOURCES.map((p) => (
              <li key={p.href}>
                <a href={p.href} target="_blank" rel="noopener noreferrer">
                  {p.label} — source post
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* CC-BY attribution for the gym set. It lives in the markup rather
            than on the glass — the visible line was clutter in a room that
            has no other captions. The roster is generated into
            public/models/LICENSES.json by scripts/stacks-models.mjs, and
            that file ships and is served, so the credit stays discoverable
            both here and at /models/LICENSES.json. */}
        <div
          aria-hidden
          className="hidden"
          dangerouslySetInnerHTML={{
            __html: `<!-- 3D props: ${licenses.attributionRequired.join(", ")} · CC-BY. Full roster: /models/LICENSES.json -->`,
          }}
        />
      </PlacardCard>
    ),
    books: (
      <PlacardCard>
        <BooksPlacard data={data} />
      </PlacardCard>
    ),
    training: <div className="placard-sections">{slots.training}</div>,
    talks: <div className="placard-sections">{slots.talks}</div>,
    projects: <div className="placard-sections">{slots.projects}</div>,
    blog: <div className="placard-sections">{slots.blog}</div>,
    systems: (
      <div className="placard-sections flex flex-col gap-8">
        {slots.manual}
        {slots.routine}
        {slots.quotes}
      </div>
    ),
  };

  return (
    <div className="font-serif text-muted-foreground">
      <style>{`
        /* No scrollbar gutter: with the panel gone the track would draw a
           grey rule straight down the scene. The edge fade is the scroll
           affordance instead. */
        .stacks-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .stacks-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
        /* ── The glass ────────────────────────────────────────────────
           One place to tune the frosting, and the four values are a set —
           changing one without re-measuring the others will cost legibility.

           The fill used to do all the work at 0.86, which is why the placard
           read as a slab parked on the room instead of a window into it.
           Most of it is now blur: a wide radius carries the room's colour
           through while destroying the detail that competes with text, and
           it also makes the surface stable — one dark shelf edge behind the
           glass gets averaged with everything around it instead of punching
           a low-contrast hole under a line of type.

           saturate() is what keeps the colour it picks up warm; a blur that
           wide averages a scene toward grey on its own.

           brightness() is the legibility lever, and the reason the fill can
           drop this far. It pushes the backdrop AWAY from the text luminance
           — up on light, down on dark — which buys contrast without buying
           opacity. It is kept gentle on purpose: measured on the real scene,
           1.6 on light clipped 42% of the glass to flat white, which costs
           more scene colour than the extra transparency wins back. At 1.25
           nothing clips and the glass carries ~2.5× the chroma it did before.

           Measured against the real scene, this set holds body copy above
           the 4.5:1 AA floor in both themes — no worse than the near-opaque
           version it replaces — at 0.20 less fill and 3.3× the blur. */
        .placard-plates {
          --plate-alpha: 0.70;
          --plate-blur: 80px;
          --plate-sat: 2;
          --plate-bright: 1.25;
        }
        /* Dark can afford to be thinner: light text on a dark room starts
           around 9:1, so the fill is doing far less legibility work there
           than it is on light. */
        .dark .placard-plates {
          --plate-alpha: 0.5;
          --plate-bright: 0.78;
        }
        /* The lift belongs to both layers — they are one card in two pieces
           and must travel exactly the same distance. */
        .placard-plates, .placard-scroll { --plate-lift: -3px; }
        .placard-plate {
          position: absolute;
          border: 1px solid hsl(var(--foreground) / 0.06);
          background-color: hsl(var(--background) / var(--plate-alpha));
          box-shadow: 0px 4px 15px 1px rgba(0, 0, 0, 0.07);
          backdrop-filter: blur(var(--plate-blur)) saturate(var(--plate-sat)) brightness(var(--plate-bright));
          -webkit-backdrop-filter: blur(var(--plate-blur)) saturate(var(--plate-sat)) brightness(var(--plate-bright));
        }
        /* Scrolled out of sight: stop paying for a blur nobody can see. Set
           from the scroll handler by arithmetic — see cull(). */
        .placard-plate[data-off] {
          visibility: hidden;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        /* Hover / keyboard focus: the glass catches a little more light and
           its edge firms up. Deliberately NOT an opacity change on anything
           in this subtree — opacity below 1 makes a backdrop root and the
           blur would die the moment you pointed at it. */
        .placard-plate[data-hover],
        .placard-plate[data-focus] {
          background-color: hsl(var(--background) / calc(var(--plate-alpha) + 0.07));
          border-color: hsl(var(--foreground) / 0.15);
          box-shadow: 0px 10px 26px 0px rgba(0, 0, 0, 0.13);
        }
        /* Pressed: settles back toward the page, shadow tightens. */
        .placard-plate[data-press] {
          box-shadow: 0px 3px 10px 0px rgba(0, 0, 0, 0.10);
        }
        @media (prefers-reduced-motion: no-preference) {
          .placard-plate,
          .placard-scroll .placard-hit {
            transition:
              transform 0.34s var(--stacks-ease, cubic-bezier(0.16, 1, 0.3, 1)),
              background-color 0.34s var(--stacks-ease, ease-out),
              border-color 0.34s var(--stacks-ease, ease-out),
              box-shadow 0.34s var(--stacks-ease, ease-out);
          }
          .placard-plate[data-hover],
          .placard-plate[data-focus],
          .placard-scroll .placard-hit:hover,
          .placard-scroll .placard-hit:focus-visible {
            transform: translateY(var(--plate-lift, -3px));
          }
          .placard-plate[data-press],
          .placard-scroll .placard-hit:active {
            transform: translateY(-1px);
          }
        }
        /* Keyboard only — the plate's lit edge is the mouse acknowledgement,
           but a focus ring has to be unmistakable. */
        .placard-scroll .placard-hit:focus-visible {
          outline: 2px solid hsl(var(--foreground) / 0.45);
          outline-offset: 3px;
        }
        .placard-sections section { margin-top: 0; }
        .placard-sections h1 { font-size: 1.25rem; line-height: 1.75rem; }
        .placard-sections h1 svg { width: 1.5rem; height: 1.5rem; }
        .placard-sections .mt-20 { margin-top: 0; }
        /* Stat values sized for a full-width section overflow the panel. */
        .placard-sections .text-2xl { font-size: 1.125rem; line-height: 1.5rem; }
        .placard-sections .sm\\:text-3xl { font-size: 1.125rem; line-height: 1.5rem; }
        .placard-sections .text-lg { font-size: 1rem; line-height: 1.4rem; }
        /* The cards are now empty frames. Their frosted surface is a plate
           rendered BEHIND the scroller (see BlurPlates) because the scroller
           carries the scroll-fade mask, and a mask kills backdrop-filter on
           everything inside it. So strip the fill and the dead blur and let
           the plate show through; the border stays, since the plate doesn't
           draw one and mobile has no plates at all. */
        .placard-scroll [class*="backdrop-blur"] {
          background-color: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        /* Desktop: hand the whole surface to the plate. The frame kept its
           border and shadow before, which drew both twice at the same rect —
           subtly heavier than intended, and it left hover with two edges to
           brighten instead of one. Transparent rather than removed so the
           border box (and every layout that depends on it) is untouched. */
        @media (min-width: 768px) {
          .placard-scroll [class*="backdrop-blur"] {
            border-color: transparent !important;
            box-shadow: none !important;
          }
        }
        /* Mobile has no plate layer — the sheet itself is the single blurred
           surface, which is what "one blur, not blur on blur" means there —
           so the cards just need a quiet fill of their own back. */
        @media (max-width: 767px) {
          .placard-scroll [class*="backdrop-blur"] {
            background-color: hsl(var(--muted) / 0.45) !important;
          }
          /* The sheet runs to the physical bottom of the screen, so the last
             line of a fully expanded placard would otherwise sit under the
             home indicator. Only the sheet's scroller — the desktop dock has
             no edge to clear. */
          [data-stacks-panel] .placard-scroll {
            padding-bottom: max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem));
          }
          /* Only at full height does the sheet reach the notch. At peek its
             top edge is two thirds of the way down the screen, and reserving
             a status bar there would just be a gap above the title. */
          [data-stacks-panel][data-sheet="expanded"] {
            padding-top: env(safe-area-inset-top);
          }
          /* A body heading that only repeats the sheet's own title. Marked
             from JS by text match — see the effect in MobilePanel. */
          [data-stacks-panel] [data-dup-title] { display: none; }
          [data-stacks-panel] { transition: padding-top 0.2s ease-out; }
        }
        /* Kill the scroll-reveal inside the placard. tailwindcss-intersect's
           variant is &:not([no-intersect]), so these styles apply BY DEFAULT
           and the observer only ever removes them — and it does one
           querySelectorAll at boot, which can never see a placard body,
           because those lazy-mount on first activation. So the reveal ran
           every time, forever. Worse, motion-blur-in-sm settles on
           filter: blur(0) grayscale(0), which is NOT filter: none, and that
           made every wrapper a permanent backdrop root — the real reason
           half the cards never blurred. Kill the animation itself rather
           than chasing the properties it leaves behind; targeting the motion
           class also covers touch, where the old perspective-based selector
           matched nothing at all. */
        .placard-scroll [class*="intersect:motion-"] {
          animation: none !important;
          filter: none !important;
          opacity: 1 !important;
        }
        /* The transform kill spares the clickable card — that transform is
           now the hover lift, and a blanket "none" is exactly what silently
           swallowed the last one. */
        .placard-scroll [class*="intersect:motion-"]:not(.placard-hit) {
          transform: none !important;
        }
        /* Kill TiltCard's hover tilt in here too. Its frosted surface is a
           plate rendered behind the scroller, and the plate cannot follow a
           per-frame 3D transform without re-measuring every card on every
           mouse move — so the card would peel away from its own backing.
           The tilt was a flat-page effect anyway; over a real 3D room a
           faked one is redundant, and this is the honest way to drop it
           rather than leaving the two layers silently out of register.

           The clickable card is exempt from the transform half: several of
           those Links carry a preserve-3d class of their own, so a blanket
           kill here would eat the hover lift too. Their tilt lives on the
           TiltCard wrapper above them, which is still flattened. */
        .placard-scroll [class*="preserve-3d"]:not(.placard-hit) {
          transform: none !important;
        }
        .placard-scroll [class*="preserve-3d"] {
          perspective: none !important;
        }
      `}</style>
      {/* Desktop: resident right dock, crossfaded by activeUnit. Wider now
          that no container has to look comfortable at that width — the
          scene keeps the left, the reading column takes the right. */}
      <div
        className={`absolute bottom-0 right-5 top-0 z-20 hidden w-[27rem] transition-opacity duration-200 md:block lg:right-8 xl:w-[31rem] ${
          modalOpen ? "pointer-events-none opacity-0" : ""
        }`}
        style={{ pointerEvents: "none" }}
      >
        {UNITS.map((unit, i) => (
          <Panel key={unit.slug} active={i === activeUnit && !modalOpen}>
            {bodies[unit.slug]}
          </Panel>
        ))}
      </div>
      {/* Mobile: peek chip → full-screen panel. */}
      <MobilePanel bodies={bodies} />
    </div>
  );
}
