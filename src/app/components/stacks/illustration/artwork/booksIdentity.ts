import type { StacksData } from "../../data";

/** Only the server fields consumed by the Books layout/materials. No notes or ratings. */
export function serializeRoomBooksArtworkIdentity(
  data: Pick<StacksData, "featuredBooks" | "featuredBookColors" | "spineBooks">,
): string {
  return JSON.stringify({
    version: 1,
    featuredBooks: data.featuredBooks.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      pageCount: book.pageCount,
      audioLengthMin: book.audioLengthMin,
    })),
    featuredBookColors: Object.fromEntries(
      Object.entries(data.featuredBookColors).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
    spineBooks: data.spineBooks.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      pageCount: book.pageCount,
      audioLengthMin: book.audioLengthMin,
      edgeColor: book.edgeColor,
    })),
  });
}
