export default function BooksLoading() {
  return (
    <div className="flex flex-col gap-8">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4">
        <div className="h-12 w-64 animate-pulse rounded-lg bg-cell" />
        <div className="h-6 w-96 animate-pulse rounded-lg bg-cell" />
      </div>

      {/* Grid Skeleton */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[2/3] animate-pulse rounded-2xl bg-cell shadow-[0px_5px_20px_2px_rgba(0,0,0,0.1)]"
          />
        ))}
      </div>
    </div>
  );
}
