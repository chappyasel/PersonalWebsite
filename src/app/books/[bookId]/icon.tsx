import { blankBookIconImage, bookCoverIconImage } from "../bookCoverIcon";

import { getBookForOG } from "~/lib/books/ogDataAccess";

import { ICON_FRAME } from "./iconLayout";

export const runtime = "nodejs";

// Same contract as the OG card: render on first request, keep it until the
// Notion sync invalidates /books/[bookId]/icon for that book.
export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = false;

export const size = { width: ICON_FRAME, height: ICON_FRAME };
export const contentType = "image/png";

export default async function Icon({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  try {
    const book = await getBookForOG(bookId);
    return await bookCoverIconImage(book, ICON_FRAME);
  } catch {
    return blankBookIconImage(ICON_FRAME);
  }
}
