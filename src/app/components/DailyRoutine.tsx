"use client";

import { ArrowRightIcon, SunHorizonIcon } from "@phosphor-icons/react";
import Link from "next/link";

import TiltCard from "./TiltCard";

const timelineMarkers = [
  { time: "3:45am", label: "Wake", isAM: true },
  { time: "6:00am", label: "Lift", isAM: true },
  { time: "7:15am", label: "Work", isAM: true },
  { time: "9:15pm", label: "Sleep", isAM: false },
];

export default function DailyRoutine() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)] md:gap-3 md:text-3xl">
        <SunHorizonIcon
          weight="duotone"
          className="size-7 shrink-0 md:size-8"
        />
        Core Daily Routine
      </h1>
      <TiltCard className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
        <Link
          href="/routine"
          className="group relative block w-full p-5 [transform-style:preserve-3d] sm:p-6"
        >
          <div className="absolute inset-0 rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]" />

          <div className="relative" style={{ transform: "translateZ(20px)" }}>
            <p className="text-lg leading-snug">
              My infamously early morning routine — from a 3:45am wake-up
              through workout, work, and wind-down by 9:15pm.
            </p>

            <div
              data-routine-timeline
              className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4"
            >
              {timelineMarkers.map(({ time, label, isAM }, index) => (
                <div
                  key={index}
                  className="flex min-w-0 items-baseline gap-1.5"
                >
                  <span
                    className={`text-sm font-bold tabular-nums ${isAM ? "text-amber-500 dark:text-amber-400" : "text-indigo-500 dark:text-indigo-400"}`}
                  >
                    {time}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-foreground/[0.07] px-3 py-1 text-xs font-semibold">
                Supplements
              </span>
              <span className="rounded-full bg-foreground/[0.07] px-3 py-1 text-xs font-semibold">
                Sleep Optimization
              </span>
              <span className="rounded-full bg-foreground/[0.07] px-3 py-1 text-xs font-semibold">
                Caffeine Strategy
              </span>
            </div>

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
    </section>
  );
}
