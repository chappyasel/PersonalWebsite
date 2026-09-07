import { cn } from "~/lib/util";

import { BooksGridSkeleton } from "./components/BooksGridSkeleton";
import { BOOKS_SIDEBAR_WIDTH_CLASS } from "./components/booksShell";

export default function BooksLoading() {
  return (
    <div className="m-auto flex max-w-screen-2xl flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="size-6 shrink-0 animate-pulse rounded-md bg-muted md:size-8" />
            <div className="h-7 w-full max-w-52 animate-pulse rounded-md bg-muted md:h-9 md:max-w-72" />
          </div>
          <div className="flex shrink-0 translate-x-3 items-center">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="size-10 animate-pulse rounded-md bg-muted/70"
              />
            ))}
            <div className="hidden size-10 animate-pulse rounded-md bg-muted/70 md:block" />
            <div className="hidden size-10 animate-pulse rounded-md bg-muted/70 2xl:block" />
          </div>
        </div>
      </div>

      {/* Desktop: Sidebar + Main */}
      <div className="flex gap-8 2xl:gap-16">
        {/* Desktop Filters Sidebar */}
        <aside
          className={cn("hidden shrink-0 sm:block", BOOKS_SIDEBAR_WIDTH_CLASS)}
        >
          <div className="flex flex-col gap-5 rounded-3xl py-2">
            {/* Filters Header */}
            <div className="h-6 w-16 animate-pulse rounded bg-muted" />
            <div className="h-px w-full bg-muted" />

            {/* Tags Section */}
            <div className="flex flex-col gap-3">
              <div className="h-5 w-12 animate-pulse rounded bg-muted" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                    <div
                      className="h-5 animate-pulse rounded-full bg-muted"
                      style={{ width: `${60 + (i % 3) * 20}px` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px w-full bg-muted" />

            {/* Toggle Rows */}
            <div className="flex items-center justify-between pr-2">
              <div className="h-5 w-20 animate-pulse rounded bg-muted" />
              <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="flex items-center justify-between pr-2">
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
            </div>

            <div className="h-px w-full bg-muted" />

            {/* Rating */}
            <div className="flex items-center gap-3">
              <div className="h-5 w-20 animate-pulse rounded bg-muted" />
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-5 w-5 animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex flex-1 flex-col gap-6">
          {/* Controls Bar */}
          <div className="-ml-2 flex w-[calc(100%+16px)] -translate-y-2 flex-col gap-2 rounded-[14px] bg-background/80 p-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="h-9 flex-1 animate-pulse rounded-md bg-muted" />
            <div className="flex gap-2">
              <div className="h-9 flex-1 animate-pulse rounded-md bg-muted sm:hidden" />
              <div className="h-9 w-11 animate-pulse rounded-md bg-muted" />
              <div className="h-9 w-10 animate-pulse rounded-md bg-muted" />
            </div>
          </div>

          <BooksGridSkeleton size="M" />
        </main>
      </div>
    </div>
  );
}
