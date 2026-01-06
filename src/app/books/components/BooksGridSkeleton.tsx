import { Skeleton } from "~/components/ui/skeleton";

// Size to preferred width mapping (matches BooksGrid)
const sizeWidths = {
  S: "110px",
  M: "170px",
  L: "260px",
} as const;

// Border radius for each size (matches BookCard)
const sizeRadius = {
  S: "rounded-lg",
  M: "rounded-xl",
  L: "rounded-2xl",
} as const;

type BooksGridSkeletonProps = {
  size?: "S" | "M" | "L";
};

export function BooksGridSkeleton({ size = "M" }: BooksGridSkeletonProps) {
  const preferredWidth = sizeWidths[size];
  const radius = sizeRadius[size];

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${preferredWidth}, calc((100% - 1rem) / 2)), 1fr))`,
      }}
    >
      {Array.from({ length: 20 }).map((_, i) => (
        <Skeleton key={i} className={`aspect-[2/3] w-full ${radius}`} />
      ))}
    </div>
  );
}
