"use client";

import {
  BookOpenIcon,
  BooksIcon,
  CalendarBlankIcon,
  ClockIcon,
  TagIcon,
} from "@phosphor-icons/react";
import Link from "next/link";

import { Skeleton } from "~/components/ui/skeleton";
import { defaultTagOrder } from "~/lib/books/tagColors";
import { devSubdomainUrl } from "~/lib/util";
import { api } from "~/trpc/react";

import BookCarousel from "./BookCarousel";
import TiltCard from "./TiltCard";

function useBookStats() {
  const { data: books, isLoading } = api.books.getAll.useQuery({
    sortField: "finished",
    sortOrder: "desc",
    limit: 500,
  });

  if (!books || books.length === 0)
    return { total: null, perYear: null, avgDays: null, isLoading };

  const total = books.length;
  const finishedDates = books
    .map((b) => b.finished)
    .filter((d): d is string => d !== null)
    .sort();

  let perYear: number | null = null;
  if (finishedDates.length >= 2) {
    const earliest = new Date(finishedDates[0]!);
    const latest = new Date(finishedDates[finishedDates.length - 1]!);
    const years =
      (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years > 0) perYear = finishedDates.length / years;
  }

  const durations = books
    .filter((b) => b.started && b.finished)
    .map((b) => {
      const start = new Date(b.started!).getTime();
      const end = new Date(b.finished!).getTime();
      return (end - start) / (1000 * 60 * 60 * 24);
    })
    .filter((d) => d > 0);
  const avgDays =
    durations.length > 0
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : null;

  return { total, perYear, avgDays, isLoading };
}

function StatValue({ value, loading }: { value: string | null; loading: boolean }) {
  if (loading || value === null) {
    return <Skeleton className="h-8 w-14 rounded bg-foreground/10 sm:h-9" />;
  }
  return (
    <span className="text-2xl font-semibold text-foreground sm:text-3xl">
      {value}
    </span>
  );
}

export default function BookNotes() {
  const { total, perYear, avgDays, isLoading } = useBookStats();

  const bookHref =
    process.env.NODE_ENV === "production"
      ? "https://books.chappyasel.com"
      : devSubdomainUrl("books");

  return (
    <section className="flex w-full flex-col items-center justify-around gap-4">
      <h1 className="flex w-full items-center gap-2 text-2xl font-semibold text-foreground [text-shadow:_0_0_20px_rgba(255,255,255,1)] md:gap-3 md:text-3xl dark:[text-shadow:_0_0_20px_rgba(0,0,0,0.8)]">
        <BooksIcon weight="duotone" className="size-7 shrink-0 md:size-8" />
        Book Notes
      </h1>
      <TiltCard
        className="w-full intersect:motion-scale-in-90 intersect:motion-blur-in-sm intersect:motion-opacity-in-50 intersect:motion-duration-1000"
        hoverScale={1.05}
      >
        <Link
          className="block w-full overflow-hidden rounded-xl border border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_12px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-300 ease-in-out hover:shadow-[0px_4px_15px_0px_rgba(0,0,0,0.1)]"
          href={bookHref}
        >
          <div className="h-[320px]">
            <BookCarousel />
          </div>
          <div className="flex flex-col items-center px-8 pb-5 pt-3">
            <div className="mb-3 h-px w-2/3 bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
            <div className="flex w-full justify-around gap-1">
              <div className="flex flex-col items-center gap-0.5">
                <StatValue value={total?.toString() ?? null} loading={isLoading} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <BookOpenIcon className="size-3.5 sm:size-4" weight="bold" />
                  Books
                </span>
              </div>
              <div className="hidden flex-col items-center gap-0.5 sm:flex">
                <StatValue value={perYear !== null ? perYear.toFixed(1) : null} loading={isLoading} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <CalendarBlankIcon className="size-3.5 sm:size-4" weight="bold" />
                  Per Year
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <StatValue value={avgDays !== null ? `${avgDays.toFixed(1)}d` : null} loading={isLoading} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <ClockIcon className="size-3.5 sm:size-4" weight="bold" />
                  Avg Read
                </span>
              </div>
              <div className="hidden flex-col items-center gap-0.5 sm:flex">
                <StatValue value={defaultTagOrder.length.toString()} loading={isLoading} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">
                  <TagIcon className="size-3.5 sm:size-4" weight="bold" />
                  Categories
                </span>
              </div>
            </div>
          </div>
        </Link>
      </TiltCard>
    </section>
  );
}
