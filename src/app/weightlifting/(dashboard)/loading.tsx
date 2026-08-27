import { Skeleton } from "~/components/ui/skeleton";

export default function WeightliftingLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 font-sans">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg md:h-9 md:w-9" />
            <Skeleton className="h-7 w-64 md:h-9" />
          </div>
          <Skeleton className="ml-9 h-4 w-24 md:ml-11" />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ))}
    </div>
  );
}
