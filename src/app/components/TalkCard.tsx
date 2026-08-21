import {
  ArrowUpRightIcon,
  ClockIcon,
  PlayIcon,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import React from "react";

import { cn } from "~/lib/util";

import TiltCard from "./TiltCard";

export type Talk = {
  videoId: string;
  title: string;
  venue: string;
  date: string;
  duration: string;
  url: string;
  thumbnail: string;
  excerpt: string;
  featured?: boolean;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Formats an ISO date as "Jun 2026" by reading the string parts directly.
 * Avoids `new Date()` so the server and client can't disagree across time zones.
 */
function formatMonthYear(iso: string) {
  const [year, month] = iso.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

export default function TalkCard({ talk }: { talk: Talk }) {
  const featured = talk.featured ?? false;

  const sizes = "(max-width: 768px) 100vw, 736px";

  return (
    <TiltCard
      interactive
      className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
    >
      <Link
        href={talk.url}
        target="_blank"
        className="group relative flex h-full w-full flex-col p-5 [transform-style:preserve-3d] sm:p-6"
      >
        {/* Background layer — sits flat so backdrop-blur doesn't flatten 3D */}
        <div
          data-placard-background=""
          data-placard-surface=""
          className="absolute inset-0 rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]"
        />

        <div
          data-placard-media=""
          className="relative aspect-video w-full overflow-hidden rounded-2xl bg-muted shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)]"
          style={{ transform: "translateZ(30px)" }}
        >
          <Image
            src={talk.thumbnail}
            alt={talk.title}
            fill
            sizes={sizes}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-black/10 transition-colors duration-300 group-hover:bg-black/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="talk-play-control flex size-14 items-center justify-center rounded-full bg-black/40 text-white shadow-[0_4px_18px_rgba(0,0,0,0.22)] ring-1 ring-white/15 transition-transform duration-300 ease-out group-hover:scale-110"
              style={{
                backdropFilter: "blur(10px) saturate(0.8) brightness(0.78)",
                WebkitBackdropFilter:
                  "blur(10px) saturate(0.8) brightness(0.78)",
              }}
            >
              <PlayIcon weight="fill" className="size-6" />
            </span>
          </div>
        </div>

        <div
          className="relative flex flex-1 flex-col pt-4"
          style={{ transform: "translateZ(20px)" }}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span>{talk.venue}</span>
            <span aria-hidden>·</span>
            <span>{formatMonthYear(talk.date)}</span>
          </div>

          <h3
            className={cn(
              "mt-3 font-semibold leading-tight text-foreground",
              featured ? "text-xl md:text-2xl" : "text-lg md:text-xl",
            )}
          >
            {talk.title}
          </h3>

          <p
            className={cn(
              "mt-2 leading-snug",
              featured ? "text-base md:text-lg" : "text-sm",
            )}
          >
            {talk.excerpt}
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-4 text-sm font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ClockIcon weight="bold" className="size-4" />
              {talk.duration}
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-foreground opacity-70 transition-opacity duration-300 group-hover:opacity-100">
              Watch
              <ArrowUpRightIcon weight="bold" className="size-4" />
            </span>
          </div>
        </div>
      </Link>
    </TiltCard>
  );
}
