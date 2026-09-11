"use client";

import Link from "next/link";
import { type ReactNode, useContext } from "react";

import { SITE_PAGES, type SitePageKey } from "~/lib/site/pages";

import { daylightAccentClass } from "~/components/daylight/sectionIcons";
import { InModalSheetContext } from "~/components/modal-sheet/ModalSheet";
import SheetLink from "~/components/modal-sheet/SheetLink";

import SitePageHoverCard, { SITE_PAGE_GLYPH } from "./SitePageHoverCard";

/**
 * A link from running text to one of the site's own pages. Inline it is the
 * page's glyph in front of the words; hovering shows the page's card
 * (SitePageHoverCard). Same tab, since it is the same site.
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
  const { Icon, accent } = SITE_PAGE_GLYPH[page];
  const accentClass = daylightAccentClass(accent);
  const inSheet = useContext(InModalSheetContext);
  const isDocument =
    page === "manual" || page === "routine" || page === "systems";
  const LinkComponent = isDocument ? SheetLink : Link;
  const url = new URL(href, "https://chappyasel.com");
  const destination =
    isDocument && inSheet
      ? `${SITE_PAGES[page].path}${url.search}${url.hash}`
      : href;
  return (
    <SitePageHoverCard page={page}>
      <LinkComponent
        href={destination}
        className="whitespace-nowrap underline decoration-muted-foreground/15 underline-offset-2 transition-colors hover:decoration-muted-foreground/30"
      >
        <Icon
          size={16}
          weight="duotone"
          className={`mr-1 inline-block align-[-0.125em] opacity-80 ${accentClass}`}
        />
        {children}
      </LinkComponent>
    </SitePageHoverCard>
  );
}
