import { ImageResponse } from "next/og";

import { getAllBooksForOG } from "~/lib/books/ogDataAccess";
import {
  convertToPngDataUri,
  fetchExternalImage,
  generateFallbackCoverSvg,
} from "~/lib/books/ogImageUtils";

import { loadGeorgiaProBold } from "./[bookId]/fonts";

// Use nodejs runtime for database access
export const runtime = "nodejs";

// OG image size
export const alt = "Chappy's Book Notes Collection";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

type BookForOG = {
  id: string;
  title: string;
  coverUrl: string | null;
};

export default async function Image() {
  try {
    // Fetch books data
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const booksResult = await getAllBooksForOG();
    const books: BookForOG[] = Array.isArray(booksResult)
      ? (booksResult as BookForOG[])
      : [];

    // Select first 28 books (14 for top row, 14 for bottom row) for edge overflow
    const selectedBooks: BookForOG[] = books.slice(0, 28);

    // If we don't have 28 books, repeat available books to fill both rows
    while (selectedBooks.length < 28 && books.length > 0) {
      const bookToAdd = books[selectedBooks.length % books.length];
      if (bookToAdd) {
        selectedBooks.push(bookToAdd);
      }
    }

    // Fetch all cover images in parallel with 3s timeout
    const coverPromises = selectedBooks.map((book) =>
      fetchExternalImage(book.coverUrl ?? null, 3000),
    );
    const coverResults = await Promise.allSettled(coverPromises);

    // Convert successful fetches to PNG data URIs, failed fetches to fallback SVGs
    const coverDataUrisPromises = coverResults.map(async (result, idx) => {
      if (result.status === "fulfilled" && result.value) {
        const pngDataUri = await convertToPngDataUri(result.value);
        if (pngDataUri) {
          return pngDataUri;
        }
      }
      const book = selectedBooks[idx];
      if (book) {
        return generateFallbackCoverSvg(book.title);
      }
      return generateFallbackCoverSvg("");
    });
    const coverDataUris: string[] = await Promise.all(coverDataUrisPromises);

    // Split covers into top and bottom rows
    const topRowCovers = coverDataUris.slice(0, 14);
    const bottomRowCovers = coverDataUris.slice(14, 28);

    // Load fonts
    const fontBold = await loadGeorgiaProBold();

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            backgroundColor: "hsl(60, 9%, 98%)",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: '"Georgia Pro"',
            position: "relative",
          }}
        >
          {/* Top Row of Book Covers - bleeding over edges */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              position: "absolute",
              top: "0px",
              left: "-50px",
            }}
          >
            {topRowCovers.map((coverSrc, idx) => (
              <div
                key={`top-${idx}`}
                style={{
                  width: "110px",
                  height: "165px",
                  borderRadius: "6px",
                  overflow: "hidden",
                  boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
                  display: "flex",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverSrc}
                  alt=""
                  width="110"
                  height="165"
                  style={{
                    objectFit: "cover",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Center Text - no background overlay */}
          <div
            style={{
              position: "absolute",
              top: "275px",
              left: "0",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: "72px",
                fontWeight: 700,
                color: "hsl(25, 5%, 38%)",
                textAlign: "center",
                letterSpacing: "-0.02em",
              }}
            >
              Book Notes ~ Chappy Asel
            </div>
          </div>

          {/* Bottom Row of Book Covers - bleeding over edges */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              position: "absolute",
              bottom: "0px",
              left: "-50px",
            }}
          >
            {bottomRowCovers.map((coverSrc, idx) => (
              <div
                key={`bottom-${idx}`}
                style={{
                  width: "110px",
                  height: "165px",
                  borderRadius: "6px",
                  overflow: "hidden",
                  boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
                  display: "flex",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverSrc}
                  alt=""
                  width="110"
                  height="165"
                  style={{
                    objectFit: "cover",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ),
      {
        ...size,
        fonts: [
          {
            name: "Georgia Pro",
            data: fontBold,
            weight: 700,
            style: "normal",
          },
        ],
      },
    );
  } catch (error) {
    console.error("Error generating OpenGraph image:", error);
    // Return a simple error image
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: "hsl(60, 9%, 98%)",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "20px",
            }}
          >
            <p
              style={{
                fontSize: "72px",
                fontWeight: 700,
                color: "hsl(25, 5%, 38%)",
                margin: 0,
              }}
            >
              Book Notes ~ Chappy Asel
            </p>
          </div>
        </div>
      ),
      {
        ...size,
      },
    );
  }
}
