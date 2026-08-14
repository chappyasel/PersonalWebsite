import {
  BookOpenIcon,
  BookOpenTextIcon,
  BooksIcon,
  CalendarBlankIcon,
  ClockIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { HomepageBookCover, HomepageBookStats } from "~/lib/books/types";
import { devSubdomainUrl } from "~/lib/util";

import { DeferredBookCarousel } from "./DeferredBookCarousel";
import TiltCard from "./TiltCard";

function StatValue({ value }: { value: string }) {
  return (
    <span className="text-2xl font-semibold text-foreground sm:text-3xl">
      {value}
    </span>
  );
}

export default function BookNotes({
  books,
  stats,
}: {
  books: HomepageBookCover[];
  stats: HomepageBookStats;
}) {
  const bookHref =
    process.env.NODE_ENV === "production"
      ? "https://books.chappyasel.com"
      : devSubdomainUrl("books");

  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)] md:gap-3 md:text-3xl">
        <BooksIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Book Notes
      </h1>
      <TiltCard
        className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
        hoverScale={1.02}
      >
        <Link
          data-placard-surface=""
          className="block w-full overflow-hidden rounded-3xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_12px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)]"
          href={bookHref}
        >
          <div className="h-[320px]">
            <DeferredBookCarousel books={books} />
          </div>
          <div className="flex flex-col items-center px-8 pb-5 pt-3">
            <div className="mb-3 h-px w-2/3 bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
            <div className="flex w-full justify-around gap-1">
              <div className="flex flex-col items-center gap-0.5">
                <StatValue value={stats.total.toString()} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <BookOpenIcon className="size-3.5 sm:size-4" weight="bold" />
                  Books
                </span>
              </div>
              <div className="hidden flex-col items-center gap-0.5 sm:flex">
                <StatValue value={stats.perYear?.toFixed(1) ?? "—"} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <CalendarBlankIcon
                    className="size-3.5 sm:size-4"
                    weight="bold"
                  />
                  Per Year
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <StatValue
                  value={stats.avgDays ? `${stats.avgDays.toFixed(1)}d` : "—"}
                />
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <ClockIcon className="size-3.5 sm:size-4" weight="bold" />
                  Avg Read
                </span>
              </div>
              <div className="hidden flex-col items-center gap-0.5 sm:flex">
                <StatValue value={stats.pagesPerDay?.toFixed(1) ?? "—"} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <BookOpenTextIcon
                    className="size-3.5 sm:size-4"
                    weight="bold"
                  />
                  Pages / Day
                </span>
              </div>
            </div>
          </div>
        </Link>
      </TiltCard>
    </section>
  );
}
