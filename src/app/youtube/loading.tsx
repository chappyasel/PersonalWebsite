import { Skeleton } from "~/components/ui/skeleton";

/** The dashboard's outline: title, status line, the three stat tiles, the
 * open Watch Time chart, and the three sections that start closed. */
export default function YouTubeLoading() {
  return (
    <div
      className="mx-auto max-w-4xl space-y-10 font-sans"
      role="status"
      aria-busy="true"
      aria-label="Loading YouTube history"
    >
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 rounded-md md:h-9 md:w-80" />
        <Skeleton className="ml-9 h-3 w-40 rounded md:ml-11" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24 rounded" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-6 w-32 rounded" />
        <Skeleton className="h-[30rem] w-full rounded-xl" />
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-6 w-44 rounded" />
      ))}
    </div>
  );
}
