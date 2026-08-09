"use client";

// Museum placards — the dense DOM content for each unit, screen-fixed as a
// sibling of the canvas (never <Html transform>). One framed panel per unit,
// docked right on desktop and as a bottom sheet on mobile, crossfaded by
// activeUnit. Panel bodies lazy-mount on first activation and stay mounted.
import {
  BookOpenIcon,
  BookOpenTextIcon,
  BooksIcon,
  CalendarBlankIcon,
  ClockIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ThemeToggle } from "~/components/ui/theme-toggle";
import { devSubdomainUrl } from "~/lib/util";

import { UNITS, type StacksData, type StacksSlots } from "../data";
import { useStacks } from "../store";

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
      className={`absolute inset-x-0 bottom-0 max-h-[40dvh] overflow-y-auto overscroll-contain rounded-2xl border border-foreground/[0.06] bg-background/80 p-5 shadow-[0px_4px_24px_2px_rgba(0,0,0,0.10)] backdrop-blur-xl transition-opacity duration-300 md:inset-x-auto md:bottom-auto md:right-0 md:top-1/2 md:max-h-[78dvh] md:w-full md:-translate-y-1/2 md:p-6 ${
        active ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
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
          <div className="opacity-70">
            <ThemeToggle />
          </div>
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
    <div
      className={`absolute inset-x-3 bottom-3 top-auto z-20 font-serif text-muted-foreground transition-opacity duration-200 md:inset-x-auto md:bottom-0 md:right-4 md:top-0 md:w-[24rem] lg:right-8 xl:w-[26rem] ${
        modalOpen ? "pointer-events-none opacity-0" : ""
      }`}
      style={{ pointerEvents: "none" }}
    >
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
      {UNITS.map((unit, i) => (
        <Panel key={unit.slug} active={i === activeUnit && !modalOpen}>
          {bodies[unit.slug]}
        </Panel>
      ))}
    </div>
  );
}
