import { ImageResponse } from "next/og";

import { getBookForOG } from "~/lib/books/ogDataAccess";
import {
  arrayBufferToDataUri,
  fetchExternalImage,
  generateFallbackCoverSvg,
} from "~/lib/books/ogImageUtils";

export const runtime = "nodejs";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  try {
    const book = await getBookForOG(bookId);
    let coverSrc: string;

    if (book.coverUrl) {
      const buffer = await fetchExternalImage(book.coverUrl);
      coverSrc = buffer
        ? arrayBufferToDataUri(buffer)
        : generateFallbackCoverSvg(book.title);
    } else {
      coverSrc = generateFallbackCoverSvg(book.title);
    }

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc}
            alt=""
            width="32"
            height="32"
            style={{ objectFit: "cover" }}
          />
        </div>
      ),
      { ...size },
    );
  } catch {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: "#f5f5f5",
            borderRadius: "4px",
          }}
        />
      ),
      { ...size },
    );
  }
}
