"use client";

import { ArrowRightIcon, BookOpenTextIcon } from "@phosphor-icons/react";
import Link from "next/link";

import TiltCard from "./TiltCard";

export default function PersonalManual() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 md:gap-3 text-2xl md:text-3xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)]">
        <BookOpenTextIcon weight="duotone" className="size-7 md:size-8 shrink-0" />
        Personal Operating Manual
      </h1>
      <TiltCard className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000">
        <Link
          href="/manual"
          className="group relative block w-full px-4 py-4 sm:px-7 sm:py-6 [transform-style:preserve-3d]"
        >
          <div className="absolute inset-0 rounded-xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-300 ease-in-out group-hover:shadow-[0px_4px_20px_0px_rgba(0,0,0,0.1)]" />

          <div className="relative" style={{ transform: "translateZ(20px)" }}>
            <p className="text-lg leading-snug">
              How I work, think, and collaborate. A guide to understanding what
              drives me and how to work with me best.
            </p>

            <blockquote className="mt-4 border-l-2 border-muted-foreground/30 pl-4 italic opacity-80">
              &ldquo;My mission is to bridge the gap between the speed of
              technological progress and society&apos;s ability to adapt, by
              building communities and tools that empower people to thrive in an
              era of accelerating change.&rdquo;
            </blockquote>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-foreground/[0.07] px-3 py-1 text-xs font-semibold">
                ENTJ-A
              </span>
              <span className="rounded-full bg-foreground/[0.07] px-3 py-1 text-xs font-semibold">
                Achiever
              </span>
              <span className="rounded-full bg-foreground/[0.07] px-3 py-1 text-xs font-semibold">
                Learner
              </span>
              <span className="rounded-full bg-foreground/[0.07] px-3 py-1 text-xs font-semibold">
                Activator
              </span>
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold transition-colors duration-300 group-hover:text-foreground">
              Read the full manual
              <ArrowRightIcon weight="bold" className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </p>
          </div>
        </Link>
      </TiltCard>
    </section>
  );
}
