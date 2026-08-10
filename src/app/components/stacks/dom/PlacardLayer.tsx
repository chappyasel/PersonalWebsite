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

function Panel({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);
  return (
    <div
      aria-hidden={!active}
      data-stacks-scrollable
      // Fade-out-then-in: the entering placard waits for the leaving one —
      // simultaneous crossfade rendered as text-over-text mush (audit §2.5).
      className={`absolute right-0 top-1/2 max-h-[78dvh] w-full -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-foreground/[0.06] bg-background/80 p-6 shadow-[0px_4px_24px_2px_rgba(0,0,0,0.10)] backdrop-blur-xl transition-opacity duration-200 ${
        active
          ? "pointer-events-auto opacity-100 delay-200"
          : "pointer-events-none opacity-0 delay-0"
      }`}
    >
      {mounted ? children : null}
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
            <div
              ref={scrollRef}
              data-stacks-scrollable
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10 font-serif text-muted-foreground"
            >
              {bodies[unit.slug]}
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
      <div className="flex flex-col gap-2">
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
      </div>
    ),
    books: <BooksPlacard data={data} />,
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
        .placard-sections section { margin-top: 0; }
        .placard-sections h1 { font-size: 1.25rem; line-height: 1.75rem; }
        .placard-sections h1 svg { width: 1.5rem; height: 1.5rem; }
        .placard-sections .mt-20 { margin-top: 0; }
        /* Stat values sized for a full-width section overflow the panel. */
        .placard-sections .text-2xl { font-size: 1.125rem; line-height: 1.5rem; }
        .placard-sections .sm\\:text-3xl { font-size: 1.125rem; line-height: 1.5rem; }
        .placard-sections .text-lg { font-size: 1rem; line-height: 1.4rem; }
      `}</style>
      {/* Desktop: resident right dock, crossfaded by activeUnit. */}
      <div
        className={`absolute bottom-0 right-4 top-0 z-20 hidden w-[24rem] transition-opacity duration-200 md:block lg:right-8 xl:w-[26rem] ${
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
