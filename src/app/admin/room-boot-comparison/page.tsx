import {
  selectHomepageReadingBooks,
  toBootReadingBooks,
} from "../../components/stacks/boot/homepageReadingBooks";
import { notFound } from "next/navigation";

import { readingBookEdgeColors } from "~/lib/books/coverEdgeColor.server";
import { getDefaultBooks } from "~/server/queries/books";
import { orEmpty } from "~/server/queries/degrade";

import { Comparison } from "./Comparison";
import { IllustratedRoom } from "./IllustratedRoom";
import {
  type CaptureCase,
  UNITS,
  type Unit,
  getSummary,
  readAsset,
} from "./data";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const [initialSummary, allBooks] = await Promise.all([
    getSummary(),
    orEmpty("boot-comparison:books", getDefaultBooks, []),
  ]);
  const readingBooks = selectHomepageReadingBooks(
    allBooks.filter((book) => !book.abandoned),
  );
  const colors = await readingBookEdgeColors(readingBooks);
  const query = await searchParams;
  if (query.variant === "illustrated") {
    const { getPrototypeContent } = await import(
      "../../components/room-illustration-prototype/PrototypeContent.server"
    );
    const initialUnit =
      typeof query.unit === "string" && UNITS.includes(query.unit as Unit)
        ? (query.unit as Unit)
        : "about";
    const initialCase: CaptureCase = `${query.theme === "dark" ? "dark" : "light"}-${query.view === "phone" ? "phone" : "desktop"}`;
    const content = getPrototypeContent(allBooks);
    const initialSvg =
      initialUnit === "about"
        ? null
        : readAsset(initialUnit, initialCase, "artwork.svg")
            .then(String)
            .catch(() => null);
    return (
      <IllustratedRoom
        summary={initialSummary}
        reading={{ books: toBootReadingBooks(readingBooks), colors }}
        content={content}
        initialUnit={initialUnit}
        initialCase={initialCase}
        initialSvg={await initialSvg}
      />
    );
  }
  return (
    <Comparison
      initialSummary={initialSummary}
      reading={{ books: toBootReadingBooks(readingBooks), colors }}
    />
  );
}
