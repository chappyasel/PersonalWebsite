"use client";

import { ArrowRightIcon, SunHorizonIcon } from "@phosphor-icons/react";
import Link from "next/link";

import { recordModalOrigin } from "~/lib/originFlight";

import TiltCard from "./TiltCard";

// Repeated by hand from the synced routine; routine.data.test.ts fails when
// these drift from public/data/routine.json.
const timelineMarkers = [
  { time: "3:45am", label: "Wake", isAM: true },
  { time: "6:15am", label: "Lift", isAM: true },
  { time: "7:30am", label: "Work", isAM: true },
  { time: "9:15pm", label: "Sleep", isAM: false },
];

const routineSections = [
  "Why So Early?",
  "Morning",
  "Evening",
  "Supplement Stacks",
  "Caffeine",
  "Sleep & Recovery",
];

export default function DailyRoutine() {
  return (
    <TiltCard
      interactive
      className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
    >
      <Link
        href="/routine"
        data-placard-link=""
        className="group relative block w-full p-5 [transform-style:preserve-3d] sm:p-6"
        onClick={(event) =>
          recordModalOrigin(event.currentTarget.getBoundingClientRect())
        }
      >
        <div
          data-placard-background=""
          data-placard-surface=""
          className="absolute inset-0 rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]"
        />

        <div className="relative" style={{ transform: "translateZ(20px)" }}>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground md:text-xl">
            <SunHorizonIcon weight="duotone" className="size-5 shrink-0" />
            Core Daily Routine
          </h2>
          <p className="mt-2 text-lg leading-snug">
            My infamously early morning routine — from a 3:45am wake-up through
            workout, work, and wind-down by 9:15pm.
          </p>

          <div
            data-routine-timeline
            className="relative mt-4 grid grid-cols-4 pb-4 pt-1"
          >
            <span
              aria-hidden="true"
              className="absolute left-[12.5%] right-[12.5%] top-3 h-0.5 bg-gradient-to-r from-amber-500 via-amber-500 to-indigo-500 dark:from-amber-400 dark:via-amber-400 dark:to-indigo-400"
            />
            {timelineMarkers.map(({ time, label, isAM }, index) => (
              <div
                key={index}
                className="relative z-10 flex min-w-0 flex-col items-center text-center"
              >
                <span
                  aria-hidden="true"
                  className={`mb-2 size-4 rounded-full border-2 bg-background/90 ${isAM ? "border-amber-500 dark:border-amber-400" : "border-indigo-500 dark:border-indigo-400"}`}
                />
                <span
                  className={`font-mono text-[0.7rem] font-semibold tabular-nums sm:text-xs ${isAM ? "text-amber-600 dark:text-amber-400" : "text-indigo-600 dark:text-indigo-400"}`}
                >
                  {time}
                </span>
                <span className="mt-1 text-xs font-medium text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <ol
            data-routine-section-index=""
            className="grid grid-cols-2 overflow-hidden rounded-2xl border border-foreground/10 sm:grid-cols-3"
          >
            {routineSections.map((section, index) => (
              <li
                key={section}
                className="flex min-h-12 items-center gap-2 border-b border-r border-foreground/10 px-3 py-2 text-sm leading-snug even:border-r-0 sm:even:border-r sm:[&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-last-child(-n+3)]:border-b-0"
              >
                <span className="font-mono text-[0.68rem] tabular-nums text-cyan-700/75 dark:text-cyan-300/75">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="font-medium text-foreground/90">
                  {section}
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold transition-colors duration-300 group-hover:text-foreground">
            See the full routine
            <ArrowRightIcon
              weight="bold"
              className="size-4 transition-transform duration-300 group-hover:translate-x-1"
            />
          </p>
        </div>
      </Link>
    </TiltCard>
  );
}
