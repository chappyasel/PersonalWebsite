import Image from "next/image";
import Link from "next/link";
import React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import type { BookLookup, RichText } from "../types";

const customEmojiMap: Record<string, { src: string; alt: string }> = {
  ":weightlifting-app:": {
    src: "/images/manual/weightlifting-app.png",
    alt: "Weightlifting App",
  },
};

const notionColorMap: Record<string, string> = {
  yellow_background: "bg-amber-100/60 dark:bg-amber-900/20",
  blue_background: "bg-blue-100/60 dark:bg-blue-900/20",
  green_background: "bg-emerald-100/60 dark:bg-emerald-900/20",
  pink_background: "bg-pink-100/60 dark:bg-pink-900/20",
  purple_background: "bg-purple-100/60 dark:bg-purple-900/20",
  red_background: "bg-red-100/60 dark:bg-red-900/20",
  orange_background: "bg-orange-100/60 dark:bg-orange-900/20",
  gray_background: "bg-gray-100/60 dark:bg-gray-800/20",
  brown_background: "bg-amber-200/40 dark:bg-amber-900/20",
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
        <Tooltip key={i}>
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
      <Tooltip>
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

function extractBookSlug(text: string): string | null {
  const match = /^https?:\/\/books\.chappyasel\.com\/([a-z0-9-]+)\/?$/.exec(text);
  return match?.[1] ?? null;
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) =>
      ["a", "an", "the", "of", "and", "for", "in", "on", "to", "with", "is"].includes(w)
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

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
        // Replace custom Notion emoji shortcodes with inline images
        const customEmoji = customEmojiMap[rt.text.trim()];
        if (customEmoji) {
          return (
            <Image
              key={i}
              src={customEmoji.src}
              alt={customEmoji.alt}
              width={20}
              height={20}
              className="mb-[-2px] inline-block h-5 w-5 -translate-y-[1px] rounded"
            />
          );
        }

        // Replace MBTI type strings with colored letters + tooltips
        const mbtiRendered = renderMBTIInline(rt.text);
        if (mbtiRendered) {
          return <React.Fragment key={i}>{mbtiRendered}</React.Fragment>;
        }

        // Replace raw book URLs with readable titles + cover images
        const slug = extractBookSlug(rt.text);
        const bookData = slug ? bookLookup?.[slug] : null;
        const bookTitle = bookData?.title ?? (slug ? humanizeSlug(slug) : null);
        let el: React.ReactNode = bookTitle ? (
          <span className="inline-flex items-baseline gap-1.5">
            {bookData?.coverUrl && (
              <Image
                src={bookData.coverUrl}
                alt={bookTitle}
                width={16}
                height={24}
                className="mb-[-2px] inline-block h-4 w-auto translate-y-[2px] rounded-[2px] shadow-sm"
              />
            )}
            <em>{bookTitle}</em>
          </span>
        ) : (
          rt.text
        );

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
                className={`${cls} ${rt.color.includes("background") ? "rounded px-1" : ""}`}
              >
                {el}
              </span>
            );
          }
        }

        if (rt.link) {
          const isExternal =
            rt.link.startsWith("http") || rt.link.startsWith("//");
          el = (
            <Link
              href={rt.link}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              className="underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:decoration-muted-foreground/60"
            >
              {el}
            </Link>
          );
        }

        return <React.Fragment key={i}>{el}</React.Fragment>;
      })}
    </>
  );
}
