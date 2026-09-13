import type { StacksData } from "../../data";

/** Ordered Books content and dimensions. Sampled palette colors do not define identity. */
export function serializeRoomBooksArtworkIdentity(
  data: Pick<StacksData, "featuredBooks" | "spineBooks">,
): string {
  return JSON.stringify({
    version: 2,
    featuredBooks: data.featuredBooks.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      pageCount: book.pageCount,
      audioLengthMin: book.audioLengthMin,
    })),
    spineBooks: data.spineBooks.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      pageCount: book.pageCount,
      audioLengthMin: book.audioLengthMin,
    })),
  });
}
