"use client";

import type { Icon } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";

import SheetLink from "~/components/modal-sheet/SheetLink";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import TiltCard from "./TiltCard";

export function DocSectionLabel({ children }: { children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="min-w-0 truncate font-medium text-foreground">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

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
  /** Stars or a rising glow, as extra background layers. */
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
    sky: [],
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
 * A document preview with its title and description over the skyline.
 * The cover grows with its text, and the shared surface clips the artwork
 * to the card's corners. The section index and update date sit below it.
 */
export default function DocCard({
  href,
  title,
  glyph: Glyph,
  sky,
  updated,
  description,
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
        className="group relative block w-full"
      >
        <div
          data-placard-background=""
          data-placard-surface=""
          className="relative w-full overflow-hidden rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]"
        >
          <div
            data-doc-cover={sky}
            className="relative min-h-40 overflow-hidden sm:min-h-44"
            style={{ color: paint.ink }}
          >
            <div
              aria-hidden
              className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              style={coverStyle}
            >
              <svg
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
            </div>
            <div
              className="homepage-card-content relative"
              style={{ textShadow: "0 1px 12px rgb(0 0 0 / 0.35)" }}
            >
              <h2 className="flex items-center gap-2 homepage-card-title font-semibold">
                <Glyph
                  aria-hidden
                  weight="duotone"
                  className="size-5 shrink-0"
                />
                {title}
              </h2>
              <p className="mt-2 homepage-card-body opacity-80">{description}</p>
            </div>
          </div>

          <div className="homepage-card-content relative text-foreground">
            <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
            <p className="mt-3 text-right homepage-card-meta text-muted-foreground opacity-60">
              Last updated {updated}
            </p>
          </div>
        </div>
      </SheetLink>
    </TiltCard>
  );
}
