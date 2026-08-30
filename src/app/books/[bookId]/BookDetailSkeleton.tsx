import { BookDetailLoadingSkeleton } from "../components/BookDetailLoadingSkeleton";

/**
 * Detail-shaped placeholder for a book page while it resolves. Full-bleed
 * over the layout (the real BookPage is fixed inset-0 too), so the visitor
 * never sees the grid-shaped books skeleton on a detail URL.
 */
export function BookDetailSkeleton() {
  return (
    <div className="fixed inset-0 z-10 bg-background">
      <BookDetailLoadingSkeleton />
    </div>
  );
}
