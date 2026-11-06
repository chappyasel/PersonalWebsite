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
 * open time in blue and one meeting picked, as tall as the link's length,
 * carried mid-drag with its dust trailing (Picked).
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

/** The Best star, white on the meeting's blue, as the page draws it. */
const STAR = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="#fff" d="M239.18 97.26A16.38 16.38 0 0 0 224.92 86l-59-4.76-22.78-55.09a16.36 16.36 0 0 0-30.27 0L90.11 81.23 31.08 86a16.46 16.46 0 0 0-9.37 28.86l45 38.83L53 211.75a16.38 16.38 0 0 0 24.5 17.82l50.5-31.08 50.53 31.08A16.4 16.4 0 0 0 203 211.75l-13.76-58.07 45-38.83a16.43 16.43 0 0 0 4.94-17.59Z"/></svg>`,
).toString("base64")}`;

/** The dust's blues, as BookDust's sprites tint it. */
const BLUES = [
  "0, 122, 255",
  "64, 156, 255",
  "120, 186, 255",
  "10, 96, 230",
  "196, 224, 255",
];

/** Where the carried meeting is, off its landing: up, left, and tipped. */
const LIFT = { x: -10, y: -14, turn: -3, scale: 1.06 };

/**
 * The lifted meeting's shadow, even all round as if lit from straight
 * above (the page's `[data-lifted]`), built from rings that sum to a soft
 * falloff: Satori draws a box-shadow untransformed, so a real one would
 * sit flat and offset under the tipped block.
 */
const SHADOW = [
  ...Array.from({ length: 4 }, (_, i) => ({ spread: 1 + i * 1.5, alpha: 0.024 })),
  ...Array.from({ length: 14 }, (_, i) => ({
    spread: 7 + i * 2.6,
    alpha: 0.02 * (1 - i / 14),
  })),
];

/** A fixed shuffle (mulberry32), so every render scatters its dust alike. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The picked meeting as the page draws it mid-drag: its landing outlined
 * in the open time, the meeting carried just off it on its shadow, with
 * the blue finish, the Best star, and the dust it sheds trailing back the
 * way it came. Coordinates are the grid's.
 */
function Picked({ minutes, top }: { minutes: number; top: number }) {
  const left = COLUMN + INSET;
  const y = top * HOUR;
  const width = COLUMN - 1 - INSET * 2;
  const height = (minutes / 60) * HOUR;
  const rand = seeded(7);
  const dust = Array.from({ length: 150 }, () => {
    const k = rand() ** 1.4;
    return {
      x: left - 4 - k * 210 + (rand() - 0.5) * 26 + rand() * width * 0.25,
      y: y + height * 0.45 - k * 120 + (rand() - 0.5) * (18 + k * 70),
      r: 1.4 + rand() * 3.4 * (1 - k * 0.55),
      a: (1 - k * 0.6) * (0.65 + rand() * 0.35),
      tint: BLUES[Math.floor(rand() * BLUES.length)]!,
    };
  });
  return (
    <>
      <div
        style={{
          position: "absolute",
          left,
          top: y,
          width,
          height,
          borderRadius: BLOCK_RADIUS,
          backgroundColor: "rgb(219, 236, 255)",
          boxShadow: `inset 0 0 0 1.5px rgba(${ACCENT}, 0.5)`,
        }}
      />
      {/* A grain is a dot on a faint halo: a blurred shadow apiece costs
          Satori seconds a card. */}
      {dust.flatMap((g, i) => {
        const halo = g.r * 2.6;
        return [halo, g.r].map((r, layer) => (
          <div
            key={`${i}-${layer}`}
            style={{
              position: "absolute",
              left: g.x - r,
              top: g.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              backgroundColor: `rgba(${g.tint}, ${(layer ? g.a : g.a * 0.16).toFixed(3)})`,
            }}
          />
        ));
      })}
      {/* Tipped as a whole, so the shadow's rings turn with the block. */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left,
          top: y,
          width,
          height,
          transform: `translate(${LIFT.x}px, ${LIFT.y}px) rotate(${LIFT.turn}deg) scale(${LIFT.scale})`,
        }}
      >
        {SHADOW.map(({ spread, alpha }) => (
          <div
            key={spread}
            style={{
              position: "absolute",
              left: -spread,
              top: -spread,
              width: width + spread * 2,
              height: height + spread * 2,
              borderRadius: BLOCK_RADIUS + spread,
              backgroundColor: `rgba(0, 0, 0, ${alpha.toFixed(4)})`,
            }}
          />
        ))}
        <div
          style={{
            display: "flex",
            position: "relative",
            alignItems: "center",
            width,
            height,
            padding: "0 16px",
            borderRadius: BLOCK_RADIUS,
            backgroundColor: `rgb(${ACCENT})`,
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%, rgba(0,0,0,0.09))",
            boxShadow:
              "inset 0 1.5px 0 rgba(255,255,255,0.3), inset 0 -1.5px 0 rgba(0,0,0,0.16)",
            color: "#ffffff",
          }}
        >
          {/* A 15-minute block is too thin to hold its time. */}
          {minutes >= 30 && (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              2:00<span style={{ fontSize: 24, opacity: 0.8 }}>p</span>
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image. */}
          <img
            src={STAR}
            width={Math.min(20, height - 8)}
            height={Math.min(20, height - 8)}
            alt=""
            style={{
              position: "absolute",
              right: 14,
              top: (height - Math.min(20, height - 8)) / 2,
            }}
          />
        </div>
      </div>
    </>
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
        <Picked minutes={picked} top={top} />
      </div>
    </div>
  );
}
