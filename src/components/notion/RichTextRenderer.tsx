import { ArrowBendRightDownIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import React from "react";

import BookLink from "~/components/books/BookLink";
import {
  sectionAccentClass,
  sectionIcon,
} from "~/components/daylight/sectionIcons";
import type { BookLookup, RichText } from "~/components/notion/types";
import SiteLink from "~/components/site/SiteLink";
import { bookSlugFromUrl, humanizeSlug } from "~/lib/books/inlineFacts";
import { isBareUrl, SITE_PAGES, sitePageForHref } from "~/lib/site/pages";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/**
 * Notion's background colors render as a low-opacity wash of the actual hue
 * rather than a solid pastel fill. A 100-level pastel at 60% reads as a
 * highlighter block sitting on top of the page; a 500-level hue at ~14% tints
 * the same words without breaking the column of text.
 */
const notionColorMap: Record<string, string> = {
  yellow_background: "bg-amber-500/14 dark:bg-amber-400/14",
  blue_background: "bg-blue-500/14 dark:bg-blue-400/14",
  green_background: "bg-emerald-500/14 dark:bg-emerald-400/14",
  pink_background: "bg-pink-500/14 dark:bg-pink-400/14",
  purple_background: "bg-purple-500/14 dark:bg-purple-400/14",
  red_background: "bg-red-500/14 dark:bg-red-400/14",
  orange_background: "bg-orange-500/14 dark:bg-orange-400/14",
  gray_background: "bg-muted",
  brown_background: "bg-amber-700/14 dark:bg-amber-600/14",
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
}: {
  content: RichText[];
  bookLookup?: BookLookup;
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

        // A bare library URL becomes the shared book link: cover, title,
        // hover card. Annotations on the run are ignored; the link owns its
        // own styling.
        const slug = bookSlugFromUrl(rt.text);
        if (slug) {
          return (
            <BookLink
              key={i}
              href={rt.link ?? rt.text}
              slug={slug}
              book={bookLookup?.[slug]}
            />
          );
        }

        // Same-page section references ("See ☕ Caffeine") swap their leading
        // emoji for the section's Phosphor glyph at render time; links to
        // the site's own pages get that page's glyph, and a pasted URL gets
        // the page's name instead of the address.
        const XrefIcon = rt.link?.startsWith("#")
          ? sectionIcon(rt.link.slice(1))
          : null;
        const page = !XrefIcon && rt.link ? sitePageForHref(rt.link) : null;
        let displayText = rt.text;
        if (XrefIcon) {
          displayText = rt.text.replace(/^\p{Extended_Pictographic}️?\s*/u, "");
        } else if (page && isBareUrl(rt.text)) {
          displayText = SITE_PAGES[page].label;
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
          const isExternal =
            rt.link.startsWith("http") || rt.link.startsWith("//");
          // Every link shares one underline. Section references and site
          // pages add the target's glyph in front of the words; that, not a
          // different underline, is what marks them as wayfinding.
          const linkClass =
            "underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:decoration-muted-foreground/60";
          if (XrefIcon) {
            const sectionId = rt.link.slice(1);
            const accent = sectionAccentClass(sectionId) ?? "";
            el = READ_MORE.test(rt.text) ? (
              <Link
                href={rt.link}
                aria-label={`Read more in ${humanizeSlug(sectionId)}`}
                className="ml-0.5 inline-flex items-center gap-0.5 align-baseline opacity-80 transition-opacity hover:opacity-100"
              >
                <XrefIcon
                  size={13}
                  weight="duotone"
                  className={`inline-block -translate-y-px ${accent}`}
                />
                <ArrowBendRightDownIcon
                  size={12}
                  weight="bold"
                  className="inline-block -translate-y-px text-muted-foreground/70"
                />
              </Link>
            ) : (
              <Link href={rt.link} className={`whitespace-nowrap ${linkClass}`}>
                <XrefIcon
                  size={13}
                  weight="duotone"
                  className={`mr-1 inline-block -translate-y-px opacity-80 ${accent}`}
                />
                {el}
              </Link>
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
                href={rt.link}
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
