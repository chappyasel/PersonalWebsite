import { ArrowBendRightDownIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import React from "react";

import { bookSlugFromUrl, humanizeSlug } from "~/lib/books/inlineFacts";
import { localMusingHref } from "~/lib/musings/links";
import { SITE_PAGES, isBareUrl, sitePageForHref } from "~/lib/site/pages";

import BookLink from "~/components/books/BookLink";
import SectionLink from "~/components/daylight/SectionLink";
import {
  sectionAccentClass,
  sectionIcon,
} from "~/components/daylight/sectionIcons";
import type { BookLookup, RichText } from "~/components/notion/types";
import SiteLink from "~/components/site/SiteLink";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/**
 * Notion's background colors render as a low-opacity wash of the actual hue
 * rather than a solid pastel fill. The opacity is bracketed: Tailwind v3
 * only emits a bare step (/10, /20) that is on its theme scale, and 14 is
 * not, so `/14` produced no rule at all and every highlight was invisible. A 100-level pastel at 60% reads as a
 * highlighter block sitting on top of the page; a 500-level hue at ~14% tints
 * the same words without breaking the column of text.
 */
const notionColorMap: Record<string, string> = {
  yellow_background: "bg-amber-500/[0.14] dark:bg-amber-400/[0.14]",
  blue_background: "bg-blue-500/[0.14] dark:bg-blue-400/[0.14]",
  green_background: "bg-emerald-500/[0.14] dark:bg-emerald-400/[0.14]",
  pink_background: "bg-pink-500/[0.14] dark:bg-pink-400/[0.14]",
  purple_background: "bg-purple-500/[0.14] dark:bg-purple-400/[0.14]",
  red_background: "bg-red-500/[0.14] dark:bg-red-400/[0.14]",
  orange_background: "bg-orange-500/[0.14] dark:bg-orange-400/[0.14]",
  gray_background: "bg-muted",
  brown_background: "bg-amber-700/[0.14] dark:bg-amber-600/[0.14]",
  yellow: "text-amber-600 dark:text-amber-400",
  blue: "text-blue-600 dark:text-blue-400",
  green: "text-emerald-600 dark:text-emerald-400",
  pink: "text-pink-600 dark:text-pink-400",
  purple: "text-purple-600 dark:text-purple-400",
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-600 dark:text-orange-400",
  gray: "text-gray-500 dark:text-gray-400",
  brown: "text-amber-800 dark:text-amber-500",
};

const mbtiColors: Record<string, string> = {
  E: "text-amber-500",
  N: "text-purple-500",
  T: "text-sky-500",
  J: "text-indigo-500",
  A: "text-emerald-600",
};

const mbtiLabels: Record<string, string> = {
  E: "Extraverted",
  I: "Introverted",
  N: "Intuitive",
  S: "Observant",
  T: "Thinking",
  F: "Feeling",
  J: "Judging",
  P: "Prospecting",
  A: "Assertive",
};

function renderMBTIInline(text: string): React.ReactNode {
  const match = /([EINSFTJP]{4})-([AT])/.exec(text);
  if (!match) return null;

  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const letters = match[1]!;
  const variant = match[2]!;

  return (
    <TooltipProvider delayDuration={200}>
      {before}
      {letters.split("").map((char, i) => (
        <Tooltip key={i} allowTapFirst>
          <TooltipTrigger asChild>
            <span
              className={`cursor-help font-semibold ${mbtiColors[char] ?? ""}`}
            >
              {char}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{mbtiLabels[char] ?? char}</p>
          </TooltipContent>
        </Tooltip>
      ))}
      <span className="text-muted-foreground/40">-</span>
      <Tooltip allowTapFirst>
        <TooltipTrigger asChild>
          <span
            className={`cursor-help font-semibold ${mbtiColors[variant] ?? ""}`}
          >
            {variant}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{mbtiLabels[variant] ?? variant}</p>
        </TooltipContent>
      </Tooltip>
      {after}
    </TooltipProvider>
  );
}

// The TL;DR hooks end in a "Read more →" link; the words give way to the
// section's glyph and a bent arrow.
const READ_MORE = /^\s*read more\s*(?:→|->)?\s*$/i;

export default function RichTextRenderer({
  content,
  bookLookup,
  secondary = false,
}: {
  content: RichText[];
  bookLookup?: BookLookup;
  /** Soften descriptions while preserving bold labels and authored colors. */
  secondary?: boolean;
}) {
  return (
    <>
      {content.map((rt, i) => {
        // A workspace emoji run carries the file the generator downloaded;
        // show it in place of the ":name:" shortcode.
        if (rt.customEmoji?.src) {
          return (
            <Image
              key={i}
              src={rt.customEmoji.src}
              alt={humanizeSlug(rt.customEmoji.name)}
              width={20}
              height={20}
              className="mb-[-2px] inline-block h-[1.1em] w-[1.1em] -translate-y-[1px] rounded"
            />
          );
        }

        // Replace MBTI type strings with colored letters + tooltips
        const mbtiRendered = renderMBTIInline(rt.text);
        if (mbtiRendered) {
          return <React.Fragment key={i}>{mbtiRendered}</React.Fragment>;
        }

        // Any run that points at a library book becomes the shared book
        // link: cover, title, hover card. A bare URL shows the library's
        // title; words the owner wrote ("7 Habits of Highly Effective
        // People") stay as written. Annotations on the run are ignored; the
        // link owns its own styling.
        const slug =
          bookSlugFromUrl(rt.text) ??
          (rt.link ? bookSlugFromUrl(rt.link) : null);
        if (slug) {
          return (
            <BookLink
              key={i}
              href={rt.link ?? rt.text}
              slug={slug}
              book={bookLookup?.[slug]}
              label={isBareUrl(rt.text) ? undefined : rt.text}
            />
          );
        }

        // Same-page section references ("See ☕ Caffeine") swap their leading
        // emoji for the section's Phosphor glyph at render time; links to
        // the site's own pages get that page's glyph, and a pasted URL gets
        // the page's title instead of the address. The title, not the short
        // label: the manual and routine arrive from Notion as page mentions
        // carrying their full titles ("Chappy's …"), so a bare link to the
        // library reads the same way, with the possessive typeset the way
        // Notion's own titles are.
        const XrefIcon = rt.link?.startsWith("#")
          ? sectionIcon(rt.link.slice(1))
          : null;
        const page = !XrefIcon && rt.link ? sitePageForHref(rt.link) : null;
        let displayText = rt.text;
        if (XrefIcon) {
          displayText = rt.text.replace(/^\p{Extended_Pictographic}️?\s*/u, "");
        } else if (page && isBareUrl(rt.text)) {
          displayText = SITE_PAGES[page].title.replace(/'/g, "\u2019");
        }

        let el: React.ReactNode = displayText;

        if (rt.bold) el = <strong className="font-semibold">{el}</strong>;
        if (rt.italic) el = <em>{el}</em>;
        if (rt.code)
          el = (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
              {el}
            </code>
          );

        if (secondary && !rt.bold && (!rt.color || rt.color === "default")) {
          el = <span className="text-foreground/75">{el}</span>;
        }

        if (rt.color) {
          const cls = notionColorMap[rt.color] ?? "";
          if (cls) {
            el = (
              <span
                className={`${cls} ${rt.color.includes("background") ? "rounded-[3px] px-0.5" : ""}`}
              >
                {el}
              </span>
            );
          }
        }

        if (rt.link) {
          const href = localMusingHref(rt.link);
          const isExternal = href.startsWith("http") || href.startsWith("//");
          // Every link shares one underline. Section references and site
          // pages add the target's glyph in front of the words; that, not a
          // different underline, is what marks them as wayfinding.
          const linkClass =
            "underline decoration-muted-foreground/15 underline-offset-2 transition-colors hover:decoration-muted-foreground/30";
          if (XrefIcon) {
            const sectionId = rt.link.slice(1);
            const accent = sectionAccentClass(sectionId) ?? "";
            el = READ_MORE.test(rt.text) ? (
              <SectionLink
                id={sectionId}
                aria-label={`Read more in ${humanizeSlug(sectionId)}`}
                className="ml-0.5 inline-flex items-center gap-0.5 align-baseline opacity-80 transition-opacity hover:opacity-100"
              >
                <XrefIcon
                  size={16}
                  weight="duotone"
                  className={`inline-block -translate-y-px ${accent}`}
                />
                <ArrowBendRightDownIcon
                  size={13}
                  weight="bold"
                  className="inline-block -translate-y-px text-muted-foreground/70"
                />
              </SectionLink>
            ) : (
              <SectionLink
                id={sectionId}
                className={`whitespace-nowrap ${linkClass}`}
              >
                <XrefIcon
                  size={16}
                  weight="duotone"
                  // 1em glyph seated 0.125em below the baseline: the visible
                  // glyph then centres on the capitals (the icon-font rule).
                  className={`mr-1 inline-block align-[-0.125em] opacity-80 ${accent}`}
                />
                {el}
              </SectionLink>
            );
          } else if (page) {
            el = (
              <SiteLink href={rt.link} page={page}>
                {el}
              </SiteLink>
            );
          } else {
            el = (
              <Link
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className={linkClass}
              >
                {el}
              </Link>
            );
          }
        }

        return <React.Fragment key={i}>{el}</React.Fragment>;
      })}
    </>
  );
}
