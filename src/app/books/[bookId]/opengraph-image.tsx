import { ImageResponse } from "next/og";

import { getBookForOG } from "~/lib/books/ogDataAccess";
import {
  arrayBufferToDataUri,
  calculateLuminance,
  fetchExternalImage,
  generateFallbackCoverSvg,
  getAverageImageColor,
  getTextColorAndOverlay,
  getTitleStyle,
  truncateTitle,
} from "~/lib/books/ogImageUtils";

import { loadGeorgiaProBold, loadGeorgiaProRegular } from "./fonts";

// Use nodejs runtime for database access
export const runtime = "nodejs";

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
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  try {
    // Fetch book data
    const book = await getBookForOG(bookId);

    // Fetch cover image if available and analyze color
    let coverImageSrc: string;
    let textColor = "rgb(255, 255, 255)"; // Default: white text
    let overlayColor = "rgba(0, 0, 0, 0.6)"; // Default: dark overlay

    if (book.coverUrl) {
      const coverBuffer = await fetchExternalImage(book.coverUrl);
      if (coverBuffer) {
        coverImageSrc = arrayBufferToDataUri(coverBuffer);

        // Analyze image color for dynamic text/overlay
        const avgColor = await getAverageImageColor(coverBuffer);
        if (avgColor) {
          const luminance = calculateLuminance(
            avgColor.r,
            avgColor.g,
            avgColor.b,
          );
          const colors = getTextColorAndOverlay(luminance);
          textColor = colors.textColor;
          overlayColor = colors.overlayColor;
        }
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

    // Load fonts
    const [fontBold, fontRegular] = await Promise.all([
      loadGeorgiaProBold(),
      loadGeorgiaProRegular(),
    ]);

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            position: "relative",
            fontFamily: '"Georgia Pro"',
          }}
        >
          {/* Blurred Background */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImageSrc}
              alt=""
              width="1200"
              height="630"
              style={{
                objectFit: "cover",
                filter: "blur(60px)",
                transform: "scale(1.1)",
              }}
            />
          </div>

          {/* Dynamic Overlay */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: overlayColor,
            }}
          />

          {/* Content Container */}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              padding: "60px",
              alignItems: "center",
              position: "relative",
            }}
          >
            {/* Cover Image */}
            <div
              style={{
                display: "flex",
                width: "300px",
                height: "450px",
                borderRadius: "30px",
                overflow: "hidden",
                boxShadow: "0px 12px 48px rgba(0, 0, 0, 0.3)",
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageSrc}
                alt={book.title}
                width="300"
                height="450"
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
                gap: "24px",
              }}
            >
              {/* Title */}
              <h1
                style={{
                  fontSize: `${titleStyle.fontSize}px`,
                  fontWeight: 700,
                  color: textColor,
                  margin: 0,
                  lineHeight: 1.1,
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
                  fontSize: "56px",
                  fontWeight: 700,
                  color: textColor,
                  margin: 0,
                  opacity: 0.9,
                }}
              >
                {book.author}
              </p>

              {/* Rating and Footer */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                {/* Rating Stars */}
                {book.rating && (
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                    }}
                  >
                    {Array.from({ length: 5 }).map((_, i) => {
                      const isFilled = i < book.rating!;
                      // Dynamic unfilled star color based on text color
                      const unfilledColor =
                        textColor === "rgb(0, 0, 0)"
                          ? "rgba(0, 0, 0, 0.2)"
                          : "rgba(255, 255, 255, 0.2)";
                      const unfilledOutlineColor =
                        textColor === "rgb(0, 0, 0)"
                          ? "rgba(0, 0, 0, 0.3)"
                          : "rgba(255, 255, 255, 0.3)";

                      return (
                        <svg
                          key={i}
                          width="40"
                          height="40"
                          viewBox="0 0 256 256"
                          style={{ flexShrink: 0 }}
                        >
                          {isFilled ? (
                            // Fill weight - single solid path
                            <path
                              d="M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z"
                              fill="rgb(250, 204, 21)"
                            />
                          ) : (
                            // Duotone weight - background + outline
                            <g>
                              <path
                                d="M229.06,108.79l-48.7,42,14.88,62.79a8.4,8.4,0,0,1-12.52,9.17L128,189.09,73.28,222.74a8.4,8.4,0,0,1-12.52-9.17l14.88-62.79-48.7-42A8.46,8.46,0,0,1,31.73,94L95.64,88.8l24.62-59.6a8.36,8.36,0,0,1,15.48,0l24.62,59.6L224.27,94A8.46,8.46,0,0,1,229.06,108.79Z"
                                fill={unfilledColor}
                              />
                              <path
                                d="M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z"
                                fill={unfilledOutlineColor}
                              />
                            </g>
                          )}
                        </svg>
                      );
                    })}
                  </div>
                )}

                {/* Footer */}
                <div
                  style={{
                    display: "flex",
                    fontSize: "40px",
                    color: textColor,
                    opacity: 0.7,
                    paddingTop: "10px",
                  }}
                >
                  Book Notes ~ Chappy Asel
                </div>
              </div>
            </div>
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
          {
            name: "Georgia Pro",
            data: fontRegular,
            weight: 400,
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
