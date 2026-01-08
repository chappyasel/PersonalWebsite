export default function BooksLoading() {
  const preferredWidth = "170px";

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            <div className="h-9 w-56 animate-pulse rounded-lg bg-muted md:w-72" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
            <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </div>

      {/* Desktop: Sidebar + Main */}
      <div className="flex gap-8 2xl:gap-16">
        {/* Desktop Filters Sidebar */}
        <aside className="hidden w-48 shrink-0 sm:block">
          <div className="flex flex-col gap-5 rounded-3xl bg-muted/20 py-2">
            {/* Filters Header */}
            <div className="h-6 w-16 animate-pulse rounded bg-muted" />
            <div className="h-px w-full bg-muted" />

            {/* Tags Section */}
            <div className="flex flex-col gap-3">
              <div className="h-5 w-12 animate-pulse rounded bg-muted" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
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
          <div className="-ml-4 flex w-[calc(100%+32px)] flex-col gap-4 rounded-2xl bg-background/80 p-4 md:flex-row md:items-center md:justify-between">
            <div className="h-10 flex-1 animate-pulse rounded-lg bg-muted" />
            <div className="flex gap-4">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-muted sm:hidden" />
              <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
            </div>
          </div>

          {/* Grid */}
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(min(${preferredWidth}, calc((100% - 1rem) / 2)), 1fr))`,
            }}
          >
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[2/3] animate-pulse rounded-xl bg-muted shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)]"
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
