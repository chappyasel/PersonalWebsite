import { ClockIcon, PlayIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import React from "react";

import { VideoTrigger } from "~/components/videos/VideoGallery";

import styles from "./CoverCard.module.css";
import talkStyles from "./TalkCard.module.css";
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
  const sizes = "(max-width: 768px) 100vw, 736px";

  return (
    <TiltCard
      interactive
      className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
    >
      <VideoTrigger
        videoId={talk.videoId}
        title={talk.title}
        className={`${styles.card} group relative flex h-full w-full [transform-style:preserve-3d] [&_svg]:size-3 [&_.talk-play-control_svg]:size-6`}
      >
        {/* Background layer — sits flat so backdrop-blur doesn't flatten 3D */}
        <div
          data-placard-background=""
          data-placard-surface=""
          className="absolute inset-0 rounded-[inherit] border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]"
        />

        <div
          data-placard-media="card-cover"
          data-placard-media-highlight=""
          className={`${styles.media} relative aspect-video shrink-0 self-start bg-muted`}
        >
          <Image
            draggable={false}
            src={talk.thumbnail}
            alt={talk.title}
            fill
            sizes={sizes}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
          <div className="absolute inset-0 bg-black/10 transition-colors duration-300 group-hover:bg-black/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              data-home-glass="control"
              data-placard-media-highlight=""
              className={`${talkStyles.playControl} talk-play-control flex size-14 items-center justify-center rounded-full transition-[background-color,transform] duration-300 ease-out group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100`}
            >
              <PlayIcon
                aria-hidden
                weight="fill"
                className="size-6 text-white"
              />
            </span>
          </div>
        </div>

        <div
          className={`${styles.body} relative flex min-w-0 flex-1 flex-col`}
          style={{ transform: "translateZ(20px)" }}
        >
          <p className="mb-1 homepage-card-meta font-semibold text-muted-foreground">
            {talk.venue}
          </p>

          <h3 className="homepage-card-title font-semibold">{talk.title}</h3>

          <p className="mt-1 line-clamp-2 homepage-card-body opacity-80">
            {talk.excerpt}
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-3 homepage-card-meta text-muted-foreground opacity-60">
            <span className="flex items-center gap-1.5">
              <ClockIcon aria-hidden className="size-3" />
              {talk.duration}
            </span>
            <time dateTime={talk.date} className="ml-auto">
              {formatMonthYear(talk.date)}
            </time>
          </div>
        </div>
      </VideoTrigger>
    </TiltCard>
  );
}
