"use client";

// The "now" strip — a quiet one-line live readout. Every value is real
// (currently-reading book, last logged lift, SF local time).
import { useEffect, useState } from "react";

import {
  formatShortDate,
  formatVolume,
  type StacksData,
} from "../data";
import { proxied } from "../theme";

function useSfTime() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const update = () =>
      setTime(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date()),
      );
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, []);
  return time;
}

export default function NowStrip({ data }: { data: StacksData }) {
  const time = useSfTime();
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-serif text-sm text-muted-foreground/90">
      {data.reading && (
        <span className="flex items-center gap-2">
          {data.reading.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxied(data.reading.coverUrl, 48)}
              alt=""
              className="h-8 w-[22px] rounded-[3px] object-cover shadow-sm"
            />
          )}
          <span>
            now reading <em>{data.reading.title}</em>
          </span>
        </span>
      )}
      {data.lastLift && (
        <>
          <span className="opacity-40">·</span>
          <span>
            last lift {formatShortDate(data.lastLift.date)},{" "}
            {formatVolume(data.lastLift.volume)} lbs
          </span>
        </>
      )}
      <span className="opacity-40">·</span>
      <span>250,000+ in The AI Collective</span>
      {time && (
        <>
          <span className="opacity-40">·</span>
          <span>{time} in San Francisco</span>
        </>
      )}
    </div>
  );
}
