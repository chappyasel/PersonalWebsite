import { ImageResponse } from "next/og";
import { getBookForOG } from "~/lib/books/ogDataAccess";
import {
  arrayBufferToDataUri,
  fetchExternalImage,
  generateFallbackCoverSvg,
  getTitleStyle,
  truncateTitle,
} from "~/lib/books/ogImageUtils";

// Edge runtime for fast generation
export const runtime = "edge";

// OG image size
export const alt = "Book cover and details";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: { bookId: string };
}) {
  try {
    // Fetch book data
    const book = await getBookForOG(params.bookId);

    // Fetch cover image if available
    let coverImageSrc: string;
    if (book.coverUrl) {
      const coverBuffer = await fetchExternalImage(book.coverUrl);
      if (coverBuffer) {
        coverImageSrc = arrayBufferToDataUri(coverBuffer);
      } else {
        // Fallback to SVG if fetch failed
        coverImageSrc = generateFallbackCoverSvg(book.title);
      }
    } else {
      // No cover URL, use fallback
      coverImageSrc = generateFallbackCoverSvg(book.title);
    }

    // Determine title styling
    const titleStyle = getTitleStyle(book.title);
    const displayTitle = titleStyle.shouldTruncate
      ? truncateTitle(book.title)
      : book.title;

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: "rgb(245, 245, 245)",
            padding: "60px",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Cover Image */}
          <div
            style={{
              display: "flex",
              width: "240px",
              height: "360px",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0px 10px 40px rgba(0, 0, 0, 0.2)",
              flexShrink: 0,
            }}
          >
            <img
              src={coverImageSrc}
              alt={book.title}
              width="240"
              height="360"
              style={{
                objectFit: "cover",
              }}
            />
          </div>

          {/* Content */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              marginLeft: "60px",
              flex: 1,
              gap: "20px",
            }}
          >
            {/* Title */}
            <h1
              style={{
                fontSize: `${titleStyle.fontSize}px`,
                fontWeight: 700,
                color: "rgb(115, 115, 115)",
                margin: 0,
                lineHeight: 1.2,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {displayTitle}
            </h1>

            {/* Author */}
            <p
              style={{
                fontSize: "32px",
                color: "rgb(115, 115, 115)",
                margin: 0,
                opacity: 0.8,
              }}
            >
              {book.author}
            </p>

            {/* Rating */}
            {book.rating && (
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                }}
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    width="28"
                    height="28"
                    viewBox="0 0 20 20"
                    style={{
                      fill:
                        i < book.rating! ? "rgb(250, 204, 21)" : "rgba(115, 115, 115, 0.2)",
                    }}
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              position: "absolute",
              bottom: "40px",
              left: "60px",
              right: "60px",
              display: "flex",
              justifyContent: "center",
              fontSize: "24px",
              color: "rgb(115, 115, 115)",
              opacity: 0.7,
            }}
          >
            📚 Book Notes ~ Chappy Asel
          </div>
        </div>
      ),
      {
        ...size,
      },
    );
  } catch (error) {
    // Return a simple error image
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: "rgb(245, 245, 245)",
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
                fontSize: "48px",
                fontWeight: 700,
                color: "rgb(115, 115, 115)",
                margin: 0,
              }}
            >
              📚 Book Notes
            </p>
            <p
              style={{
                fontSize: "24px",
                color: "rgb(115, 115, 115)",
                margin: 0,
                opacity: 0.7,
              }}
            >
              Chappy Asel
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
