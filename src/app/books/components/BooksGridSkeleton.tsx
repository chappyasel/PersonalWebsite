import { Skeleton } from "~/components/ui/skeleton";

export function BooksGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-12">
      {Array.from({ length: 20 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[2/3] w-full rounded-2xl" />
      ))}
    </div>
  );
}
