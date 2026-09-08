import type { Icon } from "@phosphor-icons/react";
import {
  BookmarkSimpleIcon,
  BooksIcon,
  CalendarIcon,
  ClockIcon,
  HeadphonesIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import { ImageResponse } from "next/og";

import { coverBackdropColor, parseHex } from "~/lib/books/coverColor";
import { getBookForOG } from "~/lib/books/ogDataAccess";
import {
  arrayBufferToDataUri,
  calculateLuminance,
  fetchExternalImage,
  getAverageImageColor,
  getTextColorAndOverlay,
  getTitleStyle,
  truncateTitle,
} from "~/lib/books/ogImageUtils";
import { phosphorSvg } from "~/lib/og/phosphor";

import { BookOgByline } from "./BookOgByline";
import { loadGeorgiaProBold, loadGeorgiaProRegular } from "./fonts";
import {
  formatLength,
  formatReadDates,
  formatSingleReadDate,
} from "~/app/books/lib/format";

// Use nodejs runtime for database access
export const runtime = "nodejs";

// Generate each image on first request and cache it until the Notion sync
// invalidates that specific book. The post-sync warmer pays the cold render
// before a social crawler can encounter it.
export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = false;

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
    let coverImageSrc: string | null = null;
    let textColor = "rgba(255, 255, 255, 0.9)"; // Default: 90% white text
    let overlayColor = "rgba(0, 0, 0, 0.6)"; // Default: dark overlay
    let usesDarkText = false;

    const applyLuminance = (luminance: number) => {
      const colors = getTextColorAndOverlay(luminance);
      textColor = colors.textColor;
      overlayColor = colors.overlayColor;
      usesDarkText = colors.usesDarkText;
    };

    if (book.coverUrl) {
      const coverBuffer = await fetchExternalImage(book.coverUrl);
      if (coverBuffer) {
        coverImageSrc = arrayBufferToDataUri(coverBuffer);

        // Analyze image color for dynamic text/overlay
        const avgColor = await getAverageImageColor(coverBuffer);
        if (avgColor) {
          applyLuminance(
            calculateLuminance(avgColor.r, avgColor.g, avgColor.b),
          );
        }
      }
    }

    // No cover, or the host would not serve it. The library's sampled jacket
    // color stands in: a board in that color carrying the title and author
    // where the cover would be, on a dark wash of the same hue, with paper
    // type. Drawn as satori boxes rather than an <svg> because the renderer
    // has no fonts for SVG text, which is why the old gray board came out
    // blank. A book the sync has not colored yet gets the neutral gray board.
    const fallback = coverImageSrc
      ? null
      : (() => {
          const board = book.coverColor ?? "#e5e5e5";
          const rgb = parseHex(board)!;
          const boardLuminance = calculateLuminance(rgb.r, rgb.g, rgb.b);
          return {
            board,
            backdrop: coverBackdropColor(board) ?? "#3a3633",
            ink:
              boardLuminance > 0.35
                ? "rgba(20, 16, 12, 0.86)"
                : "rgba(255, 252, 245, 0.94)",
          };
        })();
    if (fallback) {
      textColor = "rgba(255, 255, 255, 0.92)";
      overlayColor = "rgba(0, 0, 0, 0)";
      usesDarkText = false;
    }

    // Determine title styling
    const titleStyle = getTitleStyle(book.title);
    const displayTitle = titleStyle.shouldTruncate
      ? truncateTitle(book.title)
      : book.title;
    // The remaining facts the page lists under the byline, in order and with
    // their glyphs: length, then whichever reading row applies.
    type Fact = { key: string; icon: Icon; label: string; value: string };
    const facts: Fact[] = [];
    const length = formatLength(book.audioLengthMin, book.pageCount);
    if (length) {
      facts.push({
        key: "length",
        icon: HeadphonesIcon,
        label: "Length",
        value: length,
      });
    }
    if (book.finished) {
      facts.push({
        key: "read",
        icon: ClockIcon,
        label: "Read",
        value:
          formatReadDates(book.started, book.finished) ??
          formatSingleReadDate(book.finished),
      });
    } else if (book.abandoned) {
      facts.push({
        key: "abandoned",
        icon: BookmarkSimpleIcon,
        label: "Abandoned",
        value:
          formatReadDates(book.started, book.abandoned) ??
          formatSingleReadDate(book.abandoned),
      });
    } else if (book.started) {
      facts.push({
        key: "started",
        icon: CalendarIcon,
        label: "Started",
        value: formatSingleReadDate(book.started),
      });
    }
    const textColorWithOpacity = (opacity: number) =>
      usesDarkText
        ? `rgba(0, 0, 0, ${opacity})`
        : `rgba(255, 255, 255, ${opacity})`;

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
          {/* Blurred Background, or the dark wash of the jacket color */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              backgroundColor: fallback?.backdrop,
            }}
          >
            {coverImageSrc && (
              // eslint-disable-next-line @next/next/no-img-element
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
            )}
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
            {/* Cover Image, or the jacket-colored board */}
            <div
              style={{
                display: "flex",
                width: "307px",
                height: "460px",
                borderRadius: "20px",
                overflow: "hidden",
                boxShadow: "0px 12px 48px rgba(0, 0, 0, 0.3)",
                flexShrink: 0,
                backgroundColor: fallback?.board,
              }}
            >
              {coverImageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverImageSrc}
                  alt={book.title}
                  width="307"
                  height="460"
                  style={{
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    padding: "30px",
                    textAlign: "center",
                    color: fallback!.ink,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: "30px",
                      fontWeight: 700,
                      lineHeight: 1.2,
                      justifyContent: "center",
                    }}
                  >
                    {truncateTitle(book.title, 60)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: "20px",
                      fontWeight: 400,
                      marginTop: "14px",
                      opacity: 0.8,
                      justifyContent: "center",
                    }}
                  >
                    {book.author}
                  </div>
                </div>
              )}
            </div>

            {/* Content: the page's header column at card scale. Same
                order, weights, and relative spacing as BookDetailContent:
                breadcrumb, title, muted regular-weight byline, the facts
                list as glyph + label + value rows, stars underneath. */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                marginLeft: "60px",
                flex: 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "28px",
                  fontWeight: 400,
                  color: textColorWithOpacity(0.7),
                  marginBottom: "14px",
                }}
              >
                {phosphorSvg(BooksIcon, { size: 30, weight: "duotone" })}
                Chappy&apos;s Book Notes
              </div>

              <h1
                style={{
                  fontSize: `${titleStyle.fontSize}px`,
                  fontWeight: 700,
                  color: textColor,
                  margin: 0,
                  lineHeight: 1.125,
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

              <BookOgByline
                author={book.author}
                publicationYear={book.publicationYear}
                color={textColorWithOpacity(0.78)}
                separatorColor={textColorWithOpacity(0.38)}
              />

              {facts.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    marginTop: "32px",
                    fontSize: "28px",
                    lineHeight: 1.4,
                  }}
                >
                  {facts.map((fact) => (
                    <div
                      key={fact.key}
                      style={{ display: "flex", alignItems: "center" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          width: "36px",
                          justifyContent: "center",
                          color: textColorWithOpacity(0.6),
                        }}
                      >
                        {phosphorSvg(fact.icon, { size: 26, weight: "bold" })}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          width: "168px",
                          marginLeft: "12px",
                          color: textColorWithOpacity(0.7),
                        }}
                      >
                        {fact.label}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          color: textColorWithOpacity(0.88),
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fact.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {book.rating !== null && (
                <div style={{ display: "flex", gap: "8px", marginTop: "24px" }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ display: "flex" }}>
                      {i < book.rating!
                        ? phosphorSvg(StarIcon, {
                            size: 40,
                            weight: "fill",
                            color: "rgb(250, 204, 21)",
                          })
                        : phosphorSvg(StarIcon, {
                            size: 40,
                            weight: "duotone",
                            color: textColorWithOpacity(0.3),
                          })}
                    </div>
                  ))}
                </div>
              )}
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
              Chappy&apos;s Book Notes
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
