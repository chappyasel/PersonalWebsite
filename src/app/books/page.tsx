import BooksPageClient from "./BooksPageClient";
import {
  getCachedBookStats,
  getCachedBookTags,
  getDefaultBooks,
} from "~/server/queries/books";

export const revalidate = 86400;

export default async function BooksPage() {
  const [initialBooks, initialTags, initialStats] = await Promise.all([
    getDefaultBooks(),
    getCachedBookTags(),
    getCachedBookStats(),
  ]);

  return (
    <BooksPageClient
      initialBooks={initialBooks}
      initialTags={initialTags}
      initialStats={initialStats}
    />
  );
}
