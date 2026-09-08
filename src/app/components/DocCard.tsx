"use client";

import type { Icon } from "@phosphor-icons/react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";

import { recordModalOrigin } from "~/lib/originFlight";

import SheetLink from "~/components/modal-sheet/SheetLink";

import TiltCard from "./TiltCard";

/**
 * The hour each document's cover keeps. The routine is a 3:45 wake-up, so
 * its sky is the one it starts under; the manual is the working day; the
 * systems doc, the long view, gets the night the share cards use.
 */
export type DocSky = "dawn" | "day" | "night";

type SkyPaint = {
  /** Three gradient stops, top to horizon. */
  top: string;
  mid: string;
  low: string;
  /** The ember low on the right, as an 8-digit hex (alpha baked in). */
  ember: string;
  /** Ink for the title over the sky. */
  ink: string;
  silhouette: string;
  ggb: string;
  /** Sun, moon, stars, or a rising glow, as extra background layers. */
  sky: string[];
  /** Opacity of the lit-windows layer; unset leaves the city dark. */
  lights?: number;
};

// Day and night are the share cards' own hexes (src/lib/og/daylight.tsx).
// Dawn is the hour before the routine's first entry: deep blue overhead,
// mauve, then peach at the horizon where the sun is about to come up, and
// the last few windows still on downtown.
const PAINT: Record<DocSky, SkyPaint> = {
  day: {
    top: "#126bb0",
    mid: "#4f8ab3",
    low: "#6a9aba",
    ember: "#f5c78dcc",
    ink: "hsl(40 30% 96%)",
    silhouette: "#5b7288",
    ggb: "hsl(8 36% 42%)",
    sky: [
      "radial-gradient(circle at 84% 24%, #fff6dc 0 6px, transparent 7px)",
      "radial-gradient(circle at 84% 24%, #fff5d64d 0 15px, transparent 16px)",
    ],
  },
  night: {
    top: "#1c284d",
    mid: "#2e3e67",
    low: "#2b3050",
    ember: "#e07c3e73",
    ink: "hsl(220 25% 92%)",
    silhouette: "#191a2c",
    ggb: "#a63a46",
    sky: [
      "radial-gradient(circle at 84% 26%, #d9d8cb 0 4.5px, #aeb8c9 5.5px, transparent 6.5px)",
      "radial-gradient(circle at 84% 26%, #6b80a859 0 13px, transparent 14px)",
      ...[
        [12, 24, "d9"],
        [21, 62, "8c"],
        [33, 18, "b3"],
        [44, 40, "80"],
        [55, 14, "cc"],
        [63, 48, "8c"],
        [72, 10, "b3"],
        [93, 52, "99"],
        [97, 16, "cc"],
        [7, 58, "80"],
      ].map(
        ([x, y, a]) =>
          `radial-gradient(circle at ${x}% ${y}%, #ffffff${a} 0 1px, transparent 1.7px)`,
      ),
    ],
  },
  dawn: {
    top: "#243761",
    mid: "#7c6f96",
    low: "#d8a27a",
    ember: "#ffcf8ae6",
    ink: "hsl(40 30% 96%)",
    silhouette: "#2a2c45",
    ggb: "#8f3a42",
    sky: [
      "radial-gradient(70% 62% at 78% 104%, #ffd08ae6, #ff9f6a80 42%, transparent 74%)",
      "radial-gradient(circle at 18% 22%, #ffffff8c 0 1px, transparent 1.7px)",
      "radial-gradient(circle at 41% 12%, #ffffffa6 0 1px, transparent 1.7px)",
      "radial-gradient(circle at 9% 44%, #ffffff66 0 1px, transparent 1.7px)",
    ],
    lights: 0.55,
  },
};
PAINT.night.lights = 1;

/**
 * One of the three Notion documents as a homepage card: a cover, the way a
 * link preview or a book jacket announces a document, then the description
 * and the index the caller passes as children, then the call to read.
 *
 * The cover is the document's own hero at card scale: its sky at its hour,
 * the surveyed skyline and Golden Gate (DocSkylineDefs must be rendered
 * once nearby), and the title set in the sky ink the way the page sets it.
 * The card surface underneath keeps the shared placard markup, so the
 * desktop glass, the mobile paper, and dark mode dress it like its
 * neighbours; the cover is opaque art over that surface.
 *
 * The cover is a child of the surface and is clipped by the surface's own
 * rounded box, so whatever radius a layout gives the surface, the cover's
 * corners are that radius: a sibling with a copied radius left a crescent
 * of surface showing at every corner, and a lifted sibling overhung them
 * (TiltCard's perspective draws the translateZ layer a few pixels larger).
 * Only the body text rides the lift, as the other cards' text does.
 */
export default function DocCard({
  href,
  title,
  glyph: Glyph,
  sky,
  updated,
  description,
  cta,
  children,
}: {
  href: string;
  title: string;
  glyph: Icon;
  sky: DocSky;
  /** Already formatted ("September 2026"): the server formats it so the
   * client render cannot disagree across time zones. */
  updated: string;
  description: string;
  cta: string;
  children?: ReactNode;
}) {
  const paint = PAINT[sky];
  const coverStyle: CSSProperties = {
    color: paint.ink,
    backgroundImage: [
      ...paint.sky,
      `radial-gradient(62% 58% at 92% 100%, ${paint.ember}, transparent 70%)`,
      `linear-gradient(180deg, ${paint.top} 0%, ${paint.mid} 62%, ${paint.low} 100%)`,
    ].join(", "),
  };
  const skylineStyle = {
    color: paint.silhouette,
    "--doc-ggb": paint.ggb,
  } as CSSProperties;

  return (
    <TiltCard
      interactive
      className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
    >
      <SheetLink
        href={href}
        data-placard-link=""
        data-doc-card={sky}
        // The cover's height is padding on the link, not a margin on the
        // body: a body margin collapses through the link and the tilt wrapper
        // (neither has padding or a border) and moves the whole card down
        // while the body stays at the top, over the cover. The absolute
        // surface spans the padding box, so the cover lands in this band.
        className="group relative block w-full pt-32 [transform-style:preserve-3d] sm:pt-36"
        onClick={(event) =>
          recordModalOrigin(event.currentTarget.getBoundingClientRect())
        }
      >
        <div
          data-placard-background=""
          data-placard-surface=""
          className="absolute inset-0 overflow-hidden rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]"
        >
          <div
            data-doc-cover={sky}
            className="relative h-32 sm:h-36"
            style={coverStyle}
          >
            <svg
              aria-hidden
              className="absolute bottom-0 left-0 h-[62%] w-full"
              style={skylineStyle}
            >
              <use href="#doc-skyline" width="100%" height="100%" />
              {paint.lights !== undefined && (
                <use
                  href="#doc-skyline-lights"
                  width="100%"
                  height="100%"
                  opacity={paint.lights}
                />
              )}
            </svg>
            <div
              className="absolute inset-x-5 top-5 sm:inset-x-6"
              style={{ textShadow: "0 1px 12px rgb(0 0 0 / 0.35)" }}
            >
              <h2 className="flex items-center gap-2 text-lg font-semibold md:text-xl">
                <Glyph weight="duotone" className="size-5 shrink-0" />
                {title}
              </h2>
              <p className="mt-1 font-sans text-xs opacity-80">
                Last updated {updated}
              </p>
            </div>
          </div>
        </div>

        <div
          className="relative p-5 sm:p-6"
          style={{ transform: "translateZ(20px)" }}
        >
          <p className="text-lg leading-snug">{description}</p>
          {children}
          <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold transition-colors duration-300 group-hover:text-foreground">
            {cta}
            <ArrowRightIcon
              weight="bold"
              className="size-4 transition-transform duration-300 group-hover:translate-x-1"
            />
          </p>
        </div>
      </SheetLink>
    </TiltCard>
  );
}
