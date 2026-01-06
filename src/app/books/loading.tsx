export default function BooksLoading() {
  // Default to M size (170px preferred width)
  const preferredWidth = "170px";

  return (
    <div className="flex flex-col gap-8">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4">
        <div className="h-12 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-6 w-96 animate-pulse rounded-lg bg-muted" />
      </div>

      {/* Grid Skeleton - matches dynamic grid sizing with M size default */}
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
    </div>
  );
}
