import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { ThemeToggle } from "~/components/ui/theme-toggle";

/**
 * The wayfinding line under a daylight hero: back to the site, the theme
 * toggle, and when the page was last touched. Shared by /routine and /manual
 * so the two cannot drift.
 *
 * It sits BELOW the description rather than above the title. Above the title
 * it was the first thing read on a page whose first thing should be its name,
 * and the date carried the same weight as the link, which it has not earned —
 * hence the 60% on the date alone.
 *
 * The theme toggle lives here at this line's weight. It used to hold the
 * hero's top-right corner at full button size, which gave a utility the
 * prominence of a headline. On this line it is a tool among the page's other
 * small furniture; daylight.css retints it to the sky ink like the rest of
 * the row.
 *
 * Inside a sheet the whole row is hidden (daylight.css keys on .dl-sheet): a
 * modal opened from the site has no use for a link back to the site, the
 * theme follows the scene underneath, and the sheet already has a close
 * button and a date-free header.
 */
export default function DaylightHeroMeta({
  lastUpdated,
}: {
  lastUpdated: string;
}) {
  return (
    <div
      data-daylight-hero-meta
      className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-[hsl(var(--dl-sky-ink)/0.8)]"
    >
      <Link
        href="https://www.chappyasel.com"
        className="flex items-center gap-1.5 transition-colors hover:text-[hsl(var(--dl-sky-ink))]"
      >
        <ArrowLeftIcon size={12} weight="bold" />
        chappyasel.com
      </Link>
      <span aria-hidden className="opacity-60">
        ·
      </span>
      <ThemeToggle compact className="-mx-1" />
      <span aria-hidden className="opacity-60">
        ·
      </span>
      <span className="opacity-60">
        Last updated{" "}
        {new Date(lastUpdated).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
      </span>
    </div>
  );
}
