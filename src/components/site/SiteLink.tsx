"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { SitePageKey } from "~/lib/site/pages";

import { daylightAccentClass } from "~/components/daylight/sectionIcons";

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
  return (
    <SitePageHoverCard page={page}>
      <Link
        href={href}
        className="whitespace-nowrap underline decoration-muted-foreground/15 underline-offset-2 transition-colors hover:decoration-muted-foreground/30"
      >
        <Icon
          size={16}
          weight="duotone"
          className={`mr-1 inline-block align-[-0.125em] opacity-80 ${accentClass}`}
        />
        {children}
      </Link>
    </SitePageHoverCard>
  );
}
