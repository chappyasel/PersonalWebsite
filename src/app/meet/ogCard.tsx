import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { addDays, lengthParts } from "~/lib/booking/page";
import { dateLabel, weekdayLabel, zonedDate } from "~/lib/booking/zones";
import type { PageRead } from "~/server/booking/daybreak";

import { onlyLength } from "./metadata";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "Meet with Chappy: a week of open time on a calendar";

const INK = "29, 29, 31";
const ACCENT = "0, 122, 255";
/** The page and the calendar panel on it, as /meet draws them in light mode. */
const PAGE = "rgb(245, 245, 247)";
const GROUND = "#ffffff";
/** The panel's edge, a touch stronger than the page's so it reads small. */
const EDGE = "rgb(233, 233, 234)";
/** The page's Days and blocks, at the card's 1.5x: 4px inset, 8px corners. */
const INSET = 6;
const BLOCK_RADIUS = 12;
/** Concentric with a block's corner, as on the page. */
const RADIUS = BLOCK_RADIUS + INSET;
/** Whose "Today" the card's Days start on when the link is closed. */
const HOME_ZONE = "America/Los_Angeles";

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

let portrait: Promise<string> | undefined;

/** Chappy's photo as a data URL, the one /meet's title shows. */
export function loadMeetOgPortrait() {
  portrait ??= readFile(
    join(process.cwd(), "public/images/about/profile.jpg"),
  ).then(
    (data) => `data:image/jpeg;base64,${data.toString("base64")}`,
    (error: unknown) => {
      portrait = undefined;
      throw error;
    },
  );
  return portrait;
}

export type OgFacts = {
  title: string;
  /** The one length a link offers, or null when the booker picks. */
  length: number | null;
  /** "Google Meet", "Video call", or "In person": never a place's address. */
  call: string | null;
  /** The card's first Day, today on the host's calendar. */
  today: string;
};

/** What a link's card says. It never names the slug or a place's address. */
export function ogFacts(read: PageRead, now = Date.now()): OgFacts {
  if (read.status !== "open") {
    return {
      title: "Meet with Chappy",
      length: null,
      call: null,
      today: zonedDate(now, HOME_ZONE),
    };
  }
  const { link, timeZone } = read.page;
  return {
    today: zonedDate(now, timeZone),
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

/** The title's size; the photo above it is one and a half of its lines. */
const TITLE = 104;
const PORTRAIT = TITLE * 1.5;
const HOUR = 96;
const COLUMN = 198;
const DAYS = 3;
/** Where the Days' headings start. The panel runs off the right and bottom. */
const PANEL_LEFT = 640;
const PANEL_TOP = 40;

/**
 * The share card, drawn like the page: Chappy's photo, the title in SF Pro,
 * the length and call in secondary ink, and a corner of the schedule with
 * open time in blue and one meeting picked, as tall as the link's length.
 */
export function MeetOgCard({
  title,
  length,
  call,
  today,
  portrait,
}: OgFacts & { portrait: string }) {
  const picked = Math.max(length ?? 30, 15);
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        paddingLeft: 80,
        alignItems: "center",
        backgroundColor: PAGE,
        color: `rgb(${INK})`,
        fontFamily: "SF Pro Display",
        fontWeight: 600,
      }}
    >
      <Schedule picked={picked} today={today} />
      <div style={{ display: "flex", flexDirection: "column", width: 520 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image. */}
        <img
          src={portrait}
          width={PORTRAIT}
          height={PORTRAIT}
          alt=""
          style={{
            borderRadius: PORTRAIT / 2,
            boxShadow: `0 0 0 1.5px rgba(${INK}, 0.08)`,
            marginBottom: 24,
          }}
        />
        <div
          style={{
            fontSize: TITLE,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          {title}
        </div>
        {(length !== null || call !== null) && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              marginTop: 18,
              fontSize: 54,
              color: `rgba(${INK}, 0.55)`,
            }}
          >
            {length !== null &&
              lengthParts(length).map(({ value, unit }, i) => (
                <div
                  key={unit}
                  style={{ display: "flex", alignItems: "baseline" }}
                >
                  {i > 0 ? ` ${value}` : String(value)}
                  <span style={{ fontSize: 43, opacity: 0.8 }}>{unit}</span>
                </div>
              ))}
            {length !== null && call !== null && (
              <span style={{ margin: "0 19px" }}>·</span>
            )}
            {call}
          </div>
        )}
        <div
          style={{
            marginTop: 36,
            fontSize: 36,
            color: `rgba(${INK}, 0.4)`,
          }}
        >
          chappyasel.com
        </div>
      </div>
    </div>
  );
}

/**
 * Today, Tomorrow, and the Day after, headed as the page heads them, on a
 * white panel that runs off the card: faint hours, open time as inset blue
 * blocks, one meeting picked. Coordinates are inside the panel's edge.
 */
function Schedule({ picked, today }: { picked: number; today: string }) {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const open: [number, number, number][] = [
    [0, 0.5, 2.5],
    [0, 4, 6],
    [1, 1.5, 5.5],
    [2, 0, 1.5],
    [2, 3, 6],
  ];
  const top = 1.5;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: PANEL_LEFT,
        top: PANEL_TOP,
      }}
    >
      <div style={{ display: "flex", marginBottom: 12 }}>
        {days.map((day, i) => (
          <div
            key={day}
            style={{
              display: "flex",
              flexDirection: "column",
              width: COLUMN,
              paddingLeft: 12,
              fontSize: 30,
              lineHeight: 1.2,
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {i === 0 ? "Today" : i === 1 ? "Tomorrow" : weekdayLabel(day)}
            </div>
            <div style={{ color: `rgba(${INK}, 0.55)` }}>{dateLabel(day)}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          position: "relative",
          width: COLUMN * DAYS + 2,
          height: HOUR * 6 + 2,
          borderTop: `2px solid ${EDGE}`,
          borderLeft: `2px solid ${EDGE}`,
          borderTopLeftRadius: RADIUS,
          backgroundColor: GROUND,
        }}
      >
        {[1, 2, 3, 4, 5].map((hour) => (
          <div
            key={hour}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: hour * HOUR - 1,
              height: 1,
              backgroundColor: `rgba(${INK}, 0.06)`,
            }}
          />
        ))}
        {[1, 2].map((line) => (
          <div
            key={line}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: line * COLUMN - 1,
              width: 1,
              backgroundColor: `rgba(${INK}, 0.06)`,
            }}
          />
        ))}
        {open.map(([day, from, to]) => (
          <div
            key={`${day}-${from}`}
            style={{
              position: "absolute",
              left: day * COLUMN + INSET,
              width: COLUMN - 1 - INSET * 2,
              top: from * HOUR,
              height: (to - from) * HOUR,
              borderRadius: BLOCK_RADIUS,
              backgroundColor: `rgba(${ACCENT}, 0.1)`,
            }}
          />
        ))}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: COLUMN + INSET,
            width: COLUMN - 1 - INSET * 2,
            top: top * HOUR,
            height: (picked / 60) * HOUR,
            padding: "0 15px",
            alignItems: "center",
            borderRadius: BLOCK_RADIUS,
            backgroundColor: `rgb(${ACCENT})`,
            boxShadow: "0 1.5px 4.5px rgba(0, 0, 0, 0.15)",
            color: "#ffffff",
            fontSize: 30,
          }}
        >
          {/* A 15-minute block is too thin to hold its time. */}
          {picked >= 30 ? "2:00 PM" : ""}
        </div>
      </div>
    </div>
  );
}
