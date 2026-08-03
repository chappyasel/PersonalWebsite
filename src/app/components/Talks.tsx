import {
  ArrowUpRightIcon,
  MicrophoneStageIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import data from "public/data/speaking.json";
import React from "react";

import TalkCard, { type Talk } from "./TalkCard";

type Mention = {
  outlet: string;
  title: string;
  date: string;
  url: string;
};

const TALKS: Talk[] = data.talks;
const MENTIONS: Mention[] = data.mentions;

export default async function Talks() {
  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)] md:gap-3 md:text-3xl">
        <MicrophoneStageIcon
          weight="duotone"
          className="size-7 shrink-0 md:size-8"
        />
        Featured Talks
      </h1>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {TALKS.map((talk) => (
          <TalkCard key={talk.videoId} talk={talk} />
        ))}
      </div>

      {MENTIONS.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-1 pt-1 text-sm text-muted-foreground/75">
          <span className="font-semibold text-muted-foreground/60">
            Elsewhere
          </span>
          {MENTIONS.map((mention, index) => (
            <React.Fragment key={mention.url}>
              {index > 0 && (
                <span aria-hidden className="opacity-40">
                  ·
                </span>
              )}
              <Link
                href={mention.url}
                target="_blank"
                className="group flex items-center gap-1.5 transition-colors duration-300 hover:text-foreground"
              >
                <span className="font-semibold text-foreground/80 transition-colors duration-300 group-hover:text-foreground">
                  {mention.outlet}
                </span>
                <span className="opacity-80">{mention.title}</span>
                <ArrowUpRightIcon
                  weight="bold"
                  className="size-3.5 shrink-0 opacity-50"
                />
              </Link>
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
