"use client";

// Museum placards — the dense DOM content for each unit, screen-fixed as a
// sibling of the canvas (never <Html transform>). Desktop: one framed panel
// per unit docked right, crossfaded by activeUnit. Mobile: a 44px peek chip
// pinned bottom-center that morphs (layoutId) into a full-screen panel —
// Model B; the world stays unobstructed by default. Panel bodies lazy-mount
// on first activation and stay mounted.
import {
  BookOpenIcon,
  BookOpenTextIcon,
  BooksIcon,
  CalendarBlankIcon,
  CaretUpIcon,
  ClockIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { devSubdomainUrl } from "~/lib/util";
import licenses from "~~/models/LICENSES.json";

import { UNITS, type StacksData, type StacksSlots } from "../data";
import { PHOTO_SOURCES } from "../scene/photos";
import { closeStacksPanel, openStacksPanel, useStacks } from "../store";

/** Which edges of a scroll container have content past them. Mirrors the
 * AIC platform's pattern of only fading an edge that actually continues, so
 * a short placard gets no phantom fade. */
function useScrollEdges(ref: React.RefObject<HTMLDivElement | null>) {
  const [edges, setEdges] = useState({ top: false, bottom: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
  }, [ref]);
  return edges;
}

/** Every element in the placard that wants to be a frosted surface. The
 * shared sections mark theirs with a `backdrop-blur-*` utility; PlacardCard
 * below joins them by carrying the same class. */
const PLATE_SELECTOR = '[class*="backdrop-blur"]';
/** How far the content dissolves at each edge of the scroll viewport. */
const FADE_PX = 34;

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
 * so the lifting heatmap and the deferred sections don't mount twice. */
function BlurPlates({
  scrollRef,
  mounted,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  mounted: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [plates, setPlates] = useState<Plate[]>([]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !mounted) return;
    let raf = 0;
    const observed = new WeakSet<Element>();
    const ro = new ResizeObserver(() => schedule());

    const measure = () => {
      raf = 0;
      const all = Array.from(el.querySelectorAll<HTMLElement>(PLATE_SELECTOR));
      const base = el.getBoundingClientRect();
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
      const next: Plate[] = cards.map((c) => {
        const r = rects.get(c)!;
        return {
          top: r.top - base.top + el.scrollTop,
          left: r.left - base.left,
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
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    // Scroll only moves the layer — one transform, no re-measure, no React.
    const sync = () => {
      if (layerRef.current)
        layerRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
    };

    schedule();
    sync();
    el.addEventListener("scroll", sync, { passive: true });
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
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("scroll", sync);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollRef, mounted]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div ref={layerRef} className="absolute inset-0">
        {plates.map((p, i) => (
          <div
            key={i}
            className="absolute border border-foreground/[0.06] bg-background/[0.86] shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-[24px]"
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
  const edges = useScrollEdges(scrollRef);
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
        className="stacks-scroll placard-scroll relative h-full overflow-y-auto overscroll-contain py-[12vh] pl-1 pr-3"
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

/** Mobile Model B: peek chip ↔ full-screen panel, morphing via layoutId.
 * Close paths: X, swipe-down when the content is scrolled to top, browser
 * back — all funnel through history.back() → popstate → "closing". */
function MobilePanel({
  bodies,
}: {
  bodies: Record<(typeof UNITS)[number]["slug"], React.ReactNode>;
}) {
  const activeUnit = useStacks((s) => s.activeUnit);
  const modalOpen = useStacks((s) => s.modalOpen);
  const panelState = useStacks((s) => s.panelState);
  const setPanelState = useStacks((s) => s.setPanelState);
  const unit = UNITS[activeUnit]!;
  const open = panelState === "opening" || panelState === "open";

  // Pull-down-to-dismiss, armed only while the content sits at scrollTop 0.
  // Hand-rolled touch handling (native, non-passive) — framer's dragListener
  // sets touch-action:none on the panel and kills the inner scroll.
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Mobile keeps its sheet — full-screen over the world, an opaque surface
  // is what makes the text readable there — but it loses the inner cards
  // and gains the same edge fade, so the two form factors read as one
  // design rather than two.
  const edges = useScrollEdges(scrollRef);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !open) return;
    let startY = 0;
    let pulling = false;
    let pull = 0;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startY = t.clientY;
      pulling = false;
      pull = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY;
      const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
      if (!pulling && dy > 6 && atTop) pulling = true;
      if (!pulling) return;
      e.preventDefault();
      pull = Math.max(0, dy);
      panel.style.transform = `translateY(${pull * 0.4}px)`;
    };
    const onTouchEnd = () => {
      if (!pulling) return;
      panel.style.transition = "transform 200ms ease-out";
      panel.style.transform = "";
      setTimeout(() => {
        panel.style.transition = "";
      }, 220);
      if (pull > 120) closeStacksPanel();
      pulling = false;
    };
    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    panel.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
      panel.removeEventListener("touchend", onTouchEnd);
    };
  }, [open]);

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

  const sheetMask = `linear-gradient(to bottom, ${
    edges.top ? `transparent 0, black ${FADE_PX}px` : "black 0"
  }, ${
    edges.bottom
      ? `black calc(100% - ${FADE_PX}px), transparent 100%`
      : "black 100%"
  })`;

  return (
    <div className="md:hidden">
      <AnimatePresence>
        {open && (
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
      <AnimatePresence
        onExitComplete={() => {
          if (useStacks.getState().panelState === "closing") {
            setPanelState("closed");
          }
        }}
      >
        {open ? (
          <motion.div
            key="panel"
            ref={panelRef}
            data-stacks-panel
            layoutId="stacks-panel"
            style={{ borderRadius: 0 }}
            onLayoutAnimationComplete={() => {
              if (useStacks.getState().panelState === "opening") {
                setPanelState("open");
              }
            }}
            className="pointer-events-auto fixed inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between pb-1 pl-5 pr-2 pt-3">
              <h2 className="font-serif text-lg font-semibold text-foreground">
                {unit.label}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={closeStacksPanel}
                className="flex size-11 items-center justify-center text-muted-foreground"
              >
                <XIcon className="size-5" weight="bold" />
              </button>
            </div>
            {/* Mobile takes the same masked-scroller dissolve as desktop. It
                needs no plate layer: the sheet behind is the one blurred
                surface, so nothing inside it is asking for a backdrop. */}
            <div className="relative min-h-0 flex-1">
              <div
                ref={scrollRef}
                data-stacks-scrollable
                className="stacks-scroll placard-scroll h-full overflow-y-auto overscroll-contain px-5 py-6 font-serif text-muted-foreground"
                style={{ maskImage: sheetMask, WebkitMaskImage: sheetMask }}
              >
                {bodies[unit.slug]}
              </div>
            </div>
          </motion.div>
        ) : (
          !modalOpen && (
            <motion.button
              key="chip"
              type="button"
              data-stacks-chip
              layoutId="stacks-panel"
              style={{ borderRadius: 22 }}
              onClick={openStacksPanel}
              className="pointer-events-auto fixed inset-x-0 bottom-3 z-40 mx-auto flex h-11 w-fit max-w-[80vw] items-center gap-2 border border-foreground/[0.06] bg-background/85 px-4 font-serif text-sm text-foreground shadow-[0px_4px_24px_2px_rgba(0,0,0,0.10)] backdrop-blur"
            >
              <motion.span
                key={unit.slug}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="truncate"
              >
                {unit.label}
              </motion.span>
              <CaretUpIcon className="size-3.5 shrink-0" weight="bold" />
            </motion.button>
          )
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
        /* Mobile has no plate layer — the sheet itself is the single blurred
           surface, which is what "one blur, not blur on blur" means there —
           so the cards just need a quiet fill of their own back. */
        @media (max-width: 767px) {
          .placard-scroll [class*="backdrop-blur"] {
            background-color: hsl(var(--muted) / 0.45) !important;
          }
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
          transform: none !important;
        }
        /* Kill TiltCard's hover tilt in here too. Its frosted surface is a
           plate rendered behind the scroller, and the plate cannot follow a
           per-frame 3D transform without re-measuring every card on every
           mouse move — so the card would peel away from its own backing.
           The tilt was a flat-page effect anyway; over a real 3D room a
           faked one is redundant, and this is the honest way to drop it
           rather than leaving the two layers silently out of register. */
        .placard-scroll [class*="preserve-3d"] {
          transform: none !important;
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
