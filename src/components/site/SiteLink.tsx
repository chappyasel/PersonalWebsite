"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  BarbellIcon,
  BookOpenTextIcon,
  BooksIcon,
  SunHorizonIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SITE_PAGES, type SitePageKey } from "~/lib/site/pages";

import {
  type Accent,
  daylightAccentClass,
} from "~/components/daylight/sectionIcons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { useSitePageCards } from "./SitePageCards";
import {
  BookStatsCard,
  WorkoutStatsCard,
} from "~/app/components/stacks/dom/statsCards";

// The same glyph each page uses for itself, with an accent from the closed
// daylight palette.
const GLYPH: Record<SitePageKey, { Icon: Icon; accent: Accent }> = {
  manual: { Icon: BookOpenTextIcon, accent: "plum" },
  routine: { Icon: SunHorizonIcon, accent: "am" },
  weightlifting: { Icon: BarbellIcon, accent: "coral" },
  books: { Icon: BooksIcon, accent: "moss" },
};

/**
 * A link from running text to one of the site's own pages. Inline it is the
 * page's glyph in front of the words. Hovering shows the page: the owner's
 * title, then the same stats card the homepage placard carries for
 * Weightlifting and Book Notes, or one line on what is there for the pages
 * that have no card. Same tab, since it is the same site. Tap-first devices
 * skip the card and follow the link.
 */
export default function SiteLink({
  href,
  page,
  children,
}: {
  href: string;
  page: SitePageKey;
  children: ReactNode;
}) {
  const { Icon, accent } = GLYPH[page];
  const { title, description } = SITE_PAGES[page];
  const accentClass = daylightAccentClass(accent);
  const cards = useSitePageCards();

  const statsCard =
    page === "books" && cards?.books ? (
      <BookStatsCard data={cards.books} size="card" />
    ) : page === "weightlifting" && cards?.weightlifting ? (
      <WorkoutStatsCard data={cards.weightlifting} size="card" />
    ) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            className="whitespace-nowrap underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:decoration-muted-foreground/60"
          >
            <Icon
              size={13}
              weight="duotone"
              className={`mr-1 inline-block -translate-y-px opacity-80 ${accentClass}`}
            />
            {children}
          </Link>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={8}
          className={
            statsCard
              ? "w-[24rem] max-w-[calc(100vw-2rem)] rounded-xl p-4"
              : "max-w-72 rounded-xl p-3"
          }
        >
          <div
            className={
              statsCard ? "flex flex-col gap-3" : "flex flex-col gap-1"
            }
          >
            <p className="flex items-center gap-1.5 font-semibold leading-snug text-foreground">
              <Icon
                size={15}
                weight="duotone"
                className={`shrink-0 ${accentClass}`}
              />
              {title}
            </p>
            {statsCard ?? (
              <p className="text-muted-foreground">{description}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
