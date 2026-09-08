"use client";

import {
  BookOpenIcon,
  BookmarkSimpleIcon,
  ClockIcon,
  HeadphonesIcon,
  StarIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";

import { enhanceCoverUrl } from "~/lib/books/coverUtils";
import { humanizeSlug, inlineBookFacts } from "~/lib/books/inlineFacts";

import type { BookLookupEntry } from "~/components/notion/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/**
 * The one way to link a book from running text.
 *
 * The cover is drawn the way the library draws it: the clean art (no
 * Google page-curl edge), rounded, with a real shadow and no mat. The title
 * is italic. Hovering shows the same facts the library's own cards carry:
 * author, rating, when it was read, how long it is. Tap-first devices skip
 * the card and follow the link, which always goes to the book's notes.
 *
 * Without a library row (an unknown slug, or the database being away) the
 * link still renders from the slug alone, with no cover and no card.
 *
 * `label` is the words the owner wrote when the link sits on running text
 * rather than a pasted URL; the hover card still names the book properly.
 */
export default function BookLink({
  href,
  slug,
  book,
  label,
}: {
  href: string;
  slug: string;
  book?: BookLookupEntry;
  label?: string;
}) {
  const title = label ?? book?.title ?? humanizeSlug(slug);
  const cover = enhanceCoverUrl(book?.coverUrl ?? null);

  const anchor = (
    <Link
      href={href}
      className="inline-flex items-baseline gap-1.5 underline decoration-muted-foreground/15 underline-offset-2 transition-colors hover:decoration-muted-foreground/30"
    >
      {cover && (
        <Image
          src={cover}
          alt=""
          width={16}
          height={24}
          className="mb-[-2px] inline-block h-[1.2rem] w-auto translate-y-[2px] rounded-[2px] shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
        />
      )}
      <em>{title}</em>
    </Link>
  );

  if (!book) return anchor;

  const facts = inlineBookFacts(book);
  const ReadingIcon =
    facts.kind === "abandoned"
      ? BookmarkSimpleIcon
      : facts.kind === "reading"
        ? BookOpenIcon
        : ClockIcon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{anchor}</TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={8}
          className="max-w-72 rounded-xl p-3"
        >
          <div className="flex items-center gap-3">
            {/* The cover keeps its own proportions, about as tall as the
                five lines beside it, drawn the way the homepage carousel
                draws one; nothing is cropped. */}
            {cover && (
              <Image
                src={cover}
                alt=""
                width={96}
                height={144}
                className="h-auto w-[4.5rem] shrink-0 rounded-md shadow-[0_4px_8px_rgba(0,0,0,0.2)]"
              />
            )}
            <div className="flex min-w-0 flex-col">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                {book.title}
              </p>
              <p className="mt-0.5 line-clamp-1 text-muted-foreground">
                {book.author}
              </p>
              {book.rating != null && (
                <span
                  role="img"
                  aria-label={`${book.rating} out of 5 stars`}
                  className="mt-1.5 flex gap-px"
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <StarIcon
                      key={i}
                      size={12}
                      weight={i < book.rating! ? "fill" : "duotone"}
                      className={
                        i < book.rating!
                          ? "text-yellow-400"
                          : "text-muted-foreground/25"
                      }
                    />
                  ))}
                </span>
              )}
              {/* The same facts, with the same glyphs, as the book's own
                  page: a clock for a finished read, a bookmark for an
                  abandoned one, an open book for one in progress,
                  headphones for length. */}
              {(facts.reading ?? facts.length) && (
                <div className="mt-2 flex flex-col gap-1 text-[11px] leading-tight text-muted-foreground">
                  {facts.reading && (
                    <p className="flex items-center gap-1.5">
                      <ReadingIcon
                        size={12}
                        weight="bold"
                        className="shrink-0 opacity-70"
                      />
                      {facts.reading}
                    </p>
                  )}
                  {facts.length && (
                    <p className="flex items-center gap-1.5">
                      <HeadphonesIcon
                        size={12}
                        weight="bold"
                        className="shrink-0 opacity-70"
                      />
                      {facts.length}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
