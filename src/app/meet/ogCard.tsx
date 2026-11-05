import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { lengthParts } from "~/lib/booking/page";
import type { PageRead } from "~/server/booking/daybreak";

import { onlyLength } from "./metadata";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "Meet with Chappy: a week of open time on a calendar";

const INK = "29, 29, 31";
const ACCENT = "0, 122, 255";

let pending: ReturnType<typeof readFonts> | undefined;

async function readFonts() {
  const directory = join(process.cwd(), "src/fonts/meet");
  const [semibold, bold] = await Promise.all([
    readFile(join(directory, "SF-Pro-Display-Semibold.otf")),
    readFile(join(directory, "SF-Pro-Display-Bold.otf")),
  ]);
  return [
    { weight: 600 as const, data: semibold },
    { weight: 700 as const, data: bold },
  ].map(({ weight, data }) => ({
    name: "SF Pro Display",
    data: new Uint8Array(data).buffer,
    weight,
    style: "normal" as const,
  }));
}

/** Explicit fonts keep Satori from substituting its bundled Noto Sans. */
export function loadMeetOgFonts() {
  pending ??= readFonts().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

export type OgFacts = {
  title: string;
  /** The one length a link offers, or null when the booker picks. */
  length: number | null;
  /** "Google Meet", "Video call", or "In person": never a place's address. */
  call: string | null;
};

/** What a link's card says. It never names the slug or a place's address. */
export function ogFacts(read: PageRead): OgFacts {
  if (read.status !== "open") {
    return { title: "Meet with Chappy", length: null, call: null };
  }
  const { link } = read.page;
  return {
    title: link.title,
    length: onlyLength(link),
    call:
      link.call.kind === "meet"
        ? "Google Meet"
        : link.call.kind === "link"
          ? "Video call"
          : "In person",
  };
}

const HOUR = 64;
const COLUMN = 132;
const DAYS = ["Mon", "Tue", "Wed"];

/**
 * The share card, drawn like the page: the title in SF Pro, the length and
 * call in secondary ink, and a corner of the schedule with open time in
 * blue and one meeting picked, as tall as the link's length.
 */
export function MeetOgCard({ title, length, call }: OgFacts) {
  const picked = Math.max(length ?? 30, 15);
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: "0 80px",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#ffffff",
        color: `rgb(${INK})`,
        fontFamily: "SF Pro Display",
        fontWeight: 600,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 600 }}>
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          {title}
        </div>
        {(length !== null || call !== null) && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              marginTop: 20,
              fontSize: 40,
              color: `rgba(${INK}, 0.55)`,
            }}
          >
            {length !== null &&
              lengthParts(length).map(({ value, unit }, i) => (
                <div
                  key={unit}
                  style={{ display: "flex", alignItems: "baseline" }}
                >
                  {i > 0 ? ` ${value}` : String(value)}
                  <span style={{ fontSize: 32, opacity: 0.8 }}>{unit}</span>
                </div>
              ))}
            {length !== null && call !== null && (
              <span style={{ margin: "0 14px" }}>·</span>
            )}
            {call}
          </div>
        )}
        <div
          style={{
            marginTop: 56,
            fontSize: 26,
            color: `rgba(${INK}, 0.4)`,
          }}
        >
          chappyasel.com
        </div>
      </div>
      <Schedule picked={picked} />
    </div>
  );
}

/** Three Days of faint hours, open time washed blue, one meeting picked. */
function Schedule({ picked }: { picked: number }) {
  const open: [number, number, number][] = [
    [0, 0.5, 2.5],
    [0, 4, 6],
    [1, 1.5, 5.5],
    [2, 0, 1.5],
    [2, 3, 6],
  ];
  const top = 1.5;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", marginBottom: 12 }}>
        {DAYS.map((day) => (
          <div
            key={day}
            style={{
              width: COLUMN,
              paddingLeft: 12,
              fontSize: 22,
              color: `rgba(${INK}, 0.55)`,
            }}
          >
            {day}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          position: "relative",
          width: COLUMN * DAYS.length + 1,
          height: HOUR * 6 + 1,
          borderTop: `1px solid rgba(${INK}, 0.08)`,
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((hour) => (
          <div
            key={hour}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: hour * HOUR,
              height: 1,
              backgroundColor: `rgba(${INK}, 0.08)`,
            }}
          />
        ))}
        {[0, 1, 2, 3].map((line) => (
          <div
            key={line}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: line * COLUMN,
              width: 1,
              backgroundColor: `rgba(${INK}, 0.08)`,
            }}
          />
        ))}
        {open.map(([day, from, to]) => (
          <div
            key={`${day}-${from}`}
            style={{
              position: "absolute",
              left: day * COLUMN + 1,
              width: COLUMN - 1,
              top: from * HOUR + 1,
              height: (to - from) * HOUR - 1,
              backgroundColor: `rgba(${ACCENT}, 0.12)`,
            }}
          />
        ))}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: COLUMN + 4,
            width: COLUMN - 7,
            top: top * HOUR + 2,
            height: (picked / 60) * HOUR - 3,
            padding: "0 10px",
            alignItems: "center",
            borderRadius: 8,
            backgroundColor: `rgb(${ACCENT})`,
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.18)",
            color: "#ffffff",
            fontSize: 20,
          }}
        >
          {/* A 15-minute block is too thin to hold its time. */}
          {picked >= 30 ? "2:00 PM" : ""}
        </div>
      </div>
    </div>
  );
}
