import {
  getCachedBookStats,
  getCachedBookTags,
  getDefaultBooks,
} from "~/server/queries/books";

import BooksPageClient from "./BooksPageClient";

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
