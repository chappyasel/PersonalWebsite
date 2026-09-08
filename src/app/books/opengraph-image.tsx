import type { Icon } from "@phosphor-icons/react";
import {
  BookOpenIcon,
  BookOpenTextIcon,
  ClockIcon,
} from "@phosphor-icons/react/dist/ssr";
import { ImageResponse } from "next/og";
import sharp from "sharp";

import {
  type ColorFamily,
  coverColorFamily,
  orderByCoverColor,
} from "~/lib/books/coverColor";
import { computeHomepageBookStats } from "~/lib/books/homepage";
import { getBookshelfForOG } from "~/lib/books/ogDataAccess";
import { fetchExternalImage } from "~/lib/books/ogImageUtils";
import { phosphorSvg } from "~/lib/og/phosphor";

import { loadGeorgiaProBold, loadGeorgiaProRegular } from "./[bookId]/fonts";
import { formatShelfStat, sampleEvenly } from "./ogShelf";

// Use nodejs runtime for database access
export const runtime = "nodejs";
// Cached like the shelf page; the daily sync revalidates /books after a change
export const revalidate = 86400;

// OG image size
export const alt = "Chappy's Book Notes: the whole shelf, sorted by color";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

/**
 * The card is the shelf's own rainbow: every book with a cover, laid out in
 * the same color order the "Color" sort uses, sampled evenly so all 300-odd
 * jackets are represented by the 64 that fit. The jackets sit on one uniform
 * grid, six rows by fourteen columns, larger than the card so the outer rows
 * and columns clip. The middle two rows keep only their two outer columns on
 * each side; the ten columns between them are the window for the title and
 * the shelf's numbers. The rainbow reads left to right, row by row, through
 * it. Black, gray, and white jackets are left out: against the card's paper
 * ground they read as gaps rather than books.
 */
const COVER_WIDTH = 86;
const COVER_HEIGHT = 129;
const COVER_GAP = 6;
const COLUMNS = 14;
const ROWS = 6;
const OMITTED_FAMILIES: ReadonlySet<ColorFamily> = new Set([
  "Black",
  "Gray",
  "White",
]);
/** Rows whose middle is the title window, and how many columns stay on each
 * side of it. */
const BAND_ROWS = [2, 3];
const SIDE_COLUMNS = 2;
const COLUMN_PITCH = COVER_WIDTH + COVER_GAP;
const ROW_PITCH = COVER_HEIGHT + COVER_GAP;
const GRID_WIDTH = COLUMNS * COVER_WIDTH + (COLUMNS - 1) * COVER_GAP;
const GRID_HEIGHT = ROWS * COVER_HEIGHT + (ROWS - 1) * COVER_GAP;
/** The grid is centred, so it overhangs the card equally on every side. */
const GRID_LEFT = (size.width - GRID_WIDTH) / 2;
const GRID_TOP = (size.height - GRID_HEIGHT) / 2;
/** Thumbnails are encoded at 1.5x so the card stays crisp on a retina preview
 * without shipping 68 full-size jackets through the renderer. */
const THUMB_SCALE = 1.5;
const COVER_FETCH_TIMEOUT_MS = 3000;

const columnLeft = (col: number) => GRID_LEFT + col * COLUMN_PITCH;
const rowTop = (row: number) => GRID_TOP + row * ROW_PITCH;

const WINDOW_LEFT = columnLeft(SIDE_COLUMNS);
const WINDOW_WIDTH =
  columnLeft(COLUMNS - SIDE_COLUMNS) - COVER_GAP - WINDOW_LEFT;
const WINDOW_TOP = rowTop(BAND_ROWS[0]!);
const WINDOW_HEIGHT =
  rowTop(BAND_ROWS[BAND_ROWS.length - 1]!) + COVER_HEIGHT - WINDOW_TOP;

/** The books site's own light palette: --background, --foreground, and
 * --muted-foreground from globals.css, so the card is the page's colors. */
const PAPER = "hsl(60, 9%, 98%)";
const INK = "hsl(25, 6%, 32%)";
const INK_MUTED = "hsl(24, 6%, 36%)";

type Slot = { top: number; left: number };

/** Reading order through the card: row by row, left to right, skipping the
 * window's columns on the band rows. */
function slots(): Slot[] {
  const result: Slot[] = [];
  for (let row = 0; row < ROWS; row++) {
    const band = BAND_ROWS.includes(row);
    for (let col = 0; col < COLUMNS; col++) {
      if (band && col >= SIDE_COLUMNS && col < COLUMNS - SIDE_COLUMNS) continue;
      result.push({ top: rowTop(row), left: columnLeft(col) });
    }
  }
  return result;
}

async function coverThumb(url: string | null): Promise<string | null> {
  const bytes = await fetchExternalImage(url, COVER_FETCH_TIMEOUT_MS);
  if (!bytes) return null;
  try {
    const png = await sharp(Buffer.from(bytes))
      .rotate()
      .resize(
        Math.round(COVER_WIDTH * THUMB_SCALE),
        Math.round(COVER_HEIGHT * THUMB_SCALE),
        { fit: "cover" },
      )
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image() {
  try {
    const shelf = await getBookshelfForOG();
    const rainbow = orderByCoverColor(
      shelf.filter((book) => {
        if (!book.coverUrl || !book.coverColor) return false;
        const family = coverColorFamily(book.coverColor);
        return family !== null && !OMITTED_FAMILIES.has(family);
      }),
      "asc",
    );
    const positions = slots();
    const picked = sampleEvenly(rainbow, positions.length);
    const thumbs = await Promise.all(
      picked.map((book) => coverThumb(book.coverUrl)),
    );
    const stats = computeHomepageBookStats(shelf);
    const numbers: { icon: Icon; value: string; label: string }[] = [
      { icon: BookOpenIcon, value: String(stats.total), label: "Books" },
      {
        icon: ClockIcon,
        value: formatShelfStat(stats.avgDays, "d"),
        label: "Avg Read",
      },
      {
        icon: BookOpenTextIcon,
        value: formatShelfStat(stats.pagesPerDay),
        label: "Pages / Day",
      },
    ];

    const [fontBold, fontRegular] = await Promise.all([
      loadGeorgiaProBold(),
      loadGeorgiaProRegular(),
    ]);

    const covers = positions.map((slot, i) => ({
      key: `${i}-${picked[i]!.id}`,
      ...slot,
      color: picked[i]!.coverColor ?? "#e7e5e4",
      src: thumbs[i] ?? null,
    }));

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: PAPER,
            fontFamily: '"Georgia Pro"',
            position: "relative",
          }}
        >
          {/* Jackets in color order. A jacket the host would not serve shows
              as its sampled color, so the rainbow never has a hole. */}
          {covers.map((cover) => (
            <div
              key={cover.key}
              style={{
                position: "absolute",
                top: `${cover.top}px`,
                left: `${cover.left}px`,
                width: `${COVER_WIDTH}px`,
                height: `${COVER_HEIGHT}px`,
                borderRadius: "5px",
                overflow: "hidden",
                backgroundColor: cover.color,
                boxShadow: "0px 3px 10px rgba(0, 0, 0, 0.14)",
                display: "flex",
              }}
            >
              {cover.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover.src}
                  alt=""
                  width={COVER_WIDTH}
                  height={COVER_HEIGHT}
                  style={{ objectFit: "cover" }}
                />
              )}
            </div>
          ))}

          {/* Title and numbers in the window between the band's jackets */}
          <div
            style={{
              position: "absolute",
              top: `${WINDOW_TOP}px`,
              left: `${WINDOW_LEFT}px`,
              width: `${WINDOW_WIDTH}px`,
              height: `${WINDOW_HEIGHT}px`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "30px",
            }}
          >
            <div
              style={{
                fontSize: "76px",
                fontWeight: 700,
                color: INK,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                display: "flex",
                whiteSpace: "nowrap",
              }}
            >
              Chappy&apos;s Book Notes
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "64px",
              }}
            >
              {numbers.map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "56px",
                      fontWeight: 700,
                      color: INK,
                      lineHeight: 1.05,
                      display: "flex",
                    }}
                  >
                    {stat.value}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "26px",
                      fontWeight: 400,
                      color: INK_MUTED,
                    }}
                  >
                    {phosphorSvg(stat.icon, {
                      size: 28,
                      weight: "bold",
                      color: INK_MUTED,
                    })}
                    <div style={{ display: "flex" }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      {
        ...size,
        fonts: [
          {
            name: "Georgia Pro",
            data: fontBold,
            weight: 700,
            style: "normal",
          },
          {
            name: "Georgia Pro",
            data: fontRegular,
            weight: 400,
            style: "normal",
          },
        ],
      },
    );
  } catch (error) {
    console.error("Error generating OpenGraph image:", error);
    // Return a simple error image
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: PAPER,
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "20px",
            }}
          >
            <p
              style={{
                fontSize: "72px",
                fontWeight: 700,
                color: INK,
                margin: 0,
              }}
            >
              Chappy&apos;s Book Notes
            </p>
          </div>
        </div>
      ),
      {
        ...size,
      },
    );
  }
}
