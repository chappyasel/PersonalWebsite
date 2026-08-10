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
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref]);
  return edges;
}

/** A gradient-opacity fade at the scrolling edge.
 *
 * It has to be a SIBLING of the scroll container, never a mask on it: a
 * mask (like filter, or opacity < 1) makes its element a backdrop root, and
 * then every `backdrop-filter` inside has nothing left to sample — the
 * cards render translucent but unblurred, which is the bug the first cut
 * shipped. So the fade paints in the page colour over the content instead
 * of masking it out. */
function ScrollFade({ side }: { side: "top" | "bottom" }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 z-10 h-14 ${
        side === "top"
          ? "top-0 bg-gradient-to-b from-background/90 via-background/45 to-transparent"
          : "bottom-0 bg-gradient-to-t from-background/90 via-background/45 to-transparent"
      }`}
    />
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
  return (
    <div
      aria-hidden={!active}
      // Fade-out-then-in: the entering placard waits for the leaving one —
      // simultaneous crossfade rendered as text-over-text mush (audit §2.5).
      className={`absolute right-0 top-1/2 max-h-[80dvh] w-full -translate-y-1/2 transition-opacity duration-200 ${
        active
          ? "pointer-events-auto opacity-100 delay-200"
          : "pointer-events-none opacity-0 delay-0"
      }`}
    >
      <div
        ref={scrollRef}
        data-stacks-scrollable
        // aria-hidden is duplicated from the wrapper on purpose: the input
        // bridge and the scroll-isolation gate both look up the ACTIVE
        // scroller by this attribute pair.
        aria-hidden={!active}
        className="stacks-scroll max-h-[80dvh] overflow-y-auto overscroll-contain py-2 pl-1 pr-3"
      >
        {mounted ? children : null}
      </div>
      {edges.top && <ScrollFade side="top" />}
      {edges.bottom && <ScrollFade side="bottom" />}
    </div>
  );
}

/** One blurred surface for a content block, matching the card the shared
 * sections draw for themselves. About and Books build their bodies here
 * rather than reusing a site section, so they'd otherwise be the only
 * placards with no surface at all. */
function PlacardCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-background/[0.82] p-5 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-[24px]">
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
            <div className="relative min-h-0 flex-1">
              <div
                ref={scrollRef}
                data-stacks-scrollable
                className="stacks-scroll h-full overflow-y-auto overscroll-contain px-5 pb-10 font-serif text-muted-foreground"
              >
                {bodies[unit.slug]}
              </div>
              {edges.top && <ScrollFade side="top" />}
              {edges.bottom && <ScrollFade side="bottom" />}
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
          {/* CC-BY obligation for the gym set — roster generated into
              public/models/LICENSES.json by scripts/stacks-models.mjs. */}
          <p className="pt-2 text-center text-xs text-muted-foreground/60">
            3D props: {licenses.attributionRequired.join(", ")} · CC-BY
          </p>
        </div>
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
        /* The section cards KEEP their own blur — one blurred surface per
           content block is the design. What was wrong was stacking them
           inside a second blurred panel, and that panel is what's gone.
           They do get deeper here than on the flat page, though: those
           values were tuned against a quiet page background, and over a lit
           3D room a 40%-muted wash left the text fighting the scene. */
        .placard-sections [class*="backdrop-blur"] {
          background-color: hsl(var(--background) / 0.82) !important;
          backdrop-filter: blur(24px) !important;
          -webkit-backdrop-filter: blur(24px) !important;
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
