/**
 * Detail-shaped placeholder for a book page while it resolves. Full-bleed
 * over the layout (the real BookPage is fixed inset-0 too), so the visitor
 * never sees the grid-shaped books skeleton on a detail URL.
 */
export function BookDetailSkeleton() {
  return (
    <div className="fixed inset-0 z-10 bg-background">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-8 overflow-hidden p-6 md:p-10">
        {/* Breadcrumb */}
        <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          {/* Cover */}
          <div className="h-60 w-40 shrink-0 animate-pulse rounded-xl bg-muted md:h-72 md:w-48" />
          {/* Title, author, meta */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="h-8 w-2/3 animate-pulse rounded-md bg-muted" />
            <div className="h-5 w-1/3 animate-pulse rounded-md bg-muted/70" />
            <div className="h-5 w-24 animate-pulse rounded-md bg-muted/70" />
            <div className="mt-6 flex flex-col gap-2.5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-4 animate-pulse rounded bg-muted/60"
                  style={{ width: `${100 - (index % 3) * 12}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
