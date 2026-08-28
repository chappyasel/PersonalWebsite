"use client";

import { ArrowRightIcon, BookOpenTextIcon } from "@phosphor-icons/react";
import Link from "next/link";

import { recordModalOrigin } from "~/lib/originFlight";

import TiltCard from "./TiltCard";

const manualSections = [
  "Personality, Strengths & Blind Spots",
  "How We Collaborate",
  "Communication",
  "Feedback",
  "Hobbies",
];

export default function PersonalManual() {
  return (
    <TiltCard
      interactive
      className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
    >
      <Link
        href="/manual"
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
            <BookOpenTextIcon weight="duotone" className="size-5 shrink-0" />
            Personal Operating Manual
          </h2>
          <p className="mt-2 text-lg leading-snug">
            How I work, think, and collaborate. A guide to understanding what
            drives me and how to work with me best.
          </p>

          <ol
            data-manual-section-index=""
            className="mt-4 grid grid-cols-1 overflow-hidden rounded-2xl border border-foreground/10 sm:grid-cols-2"
          >
            {manualSections.map((section, index) => (
              <li
                key={section}
                className={`flex min-h-12 items-center gap-2 border-b border-foreground/10 px-3 py-2 text-sm leading-snug last:border-b-0 ${index === manualSections.length - 1 ? "sm:col-span-2" : index % 2 === 0 ? "sm:border-r" : ""}`}
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
            Read the full manual
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
