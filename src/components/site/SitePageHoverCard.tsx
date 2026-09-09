"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  BarbellIcon,
  BookOpenTextIcon,
  BooksIcon,
  GearIcon,
  SunHorizonIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { textOfChildren } from "~/lib/anchors";
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
export const SITE_PAGE_GLYPH: Record<
  SitePageKey,
  { Icon: Icon; accent: Accent }
> = {
  manual: { Icon: BookOpenTextIcon, accent: "plum" },
  routine: { Icon: SunHorizonIcon, accent: "am" },
  systems: { Icon: GearIcon, accent: "indigo" },
  weightlifting: { Icon: BarbellIcon, accent: "coral" },
  books: { Icon: BooksIcon, accent: "moss" },
};

/** "Chappy's Book Notes" and "Chappy’s Book Notes" are the same name. */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/[’']/g, "'").trim().toLowerCase();
  return norm(a) === norm(b);
}

/**
 * The hover card for one of the site's own pages, around whatever element
 * points at it: a link in running text (SiteLink), the breadcrumb at the
 * top of a book. The owner's title, then the same stats card the homepage
 * placard carries for Weightlifting and Book Notes when the page provided
 * one (SitePageCardsProvider), or one line on what is there. The title is
 * left off when the element already says it (the breadcrumb, a link whose
 * words are the page's name), so the card never repeats the words under
 * the pointer. Tap-first devices skip the card and follow the element.
 */
export default function SitePageHoverCard({
  page,
  children,
  delayDuration = 200,
  triggerText,
}: {
  page: SitePageKey;
  /** The trigger. It receives the tooltip's props, so it must take a ref. */
  children: ReactNode;
  delayDuration?: number;
  /** The words on the trigger, when they are not simply its children (the
   * breadcrumb adds a count). Compared with the page's title. */
  triggerText?: string;
}) {
  const { Icon, accent } = SITE_PAGE_GLYPH[page];
  const { title, description } = SITE_PAGES[page];
  const accentClass = daylightAccentClass(accent);
  const cards = useSitePageCards();
  const titled = !sameName(triggerText ?? textOfChildren(children), title);

  const statsCard =
    page === "books" && cards?.books ? (
      <BookStatsCard data={cards.books} size="card" />
    ) : page === "weightlifting" && cards?.weightlifting ? (
      <WorkoutStatsCard data={cards.weightlifting} size="card" />
    ) : null;

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
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
            {titled && (
              <p className="flex items-center gap-1.5 font-semibold leading-snug text-foreground">
                <Icon
                  size={15}
                  weight="duotone"
                  className={`shrink-0 ${accentClass}`}
                />
                {title}
              </p>
            )}
            {statsCard ?? (
              <p className="text-muted-foreground">{description}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
