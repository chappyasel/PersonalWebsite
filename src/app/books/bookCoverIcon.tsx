import { ImageResponse } from "next/og";

import { coverBackdropColor } from "~/lib/books/coverColor";
import {
  arrayBufferToDataUri,
  calculateLuminance,
  fetchExternalImage,
  generateFallbackCoverSvg,
  getAverageImageColor,
  getImageDimensions,
  getTextColorAndOverlay,
} from "~/lib/books/ogImageUtils";
import { TILE_RADIUS } from "~/lib/icons/siteIconSizes";

import {
  ICON_FRAME,
  ICON_INSET,
  type ImageDimensions,
  fitCoverInFrame,
} from "./[bookId]/iconLayout";

export type BookForIcon = {
  title: string;
  coverUrl: string | null;
  /** The library's sampled jacket color; paints the fallback board when the
   * cover itself cannot be fetched. */
  coverColor?: string | null;
};

/**
 * A whole cover, centred on a blurred and tinted copy of itself: the OG
 * card's composition at favicon scale. Every book page draws its own; the
 * library root draws the book at the front of the shelf. `frame` scales the
 * geometry (the OG card blurs its backdrop by 60px on a 630px canvas and
 * floats the cover on a 12px/48px shadow; these are those proportions).
 */
export async function bookCoverIconImage(
  book: BookForIcon,
  frame = ICON_FRAME,
): Promise<ImageResponse> {
  const backdropBlur = Math.round(frame * 0.09);
  const backdropScale = 1.3;
  const coverShadow = `0px ${Math.round(frame * 0.02)}px ${Math.round(
    frame * 0.075,
  )}px rgba(0, 0, 0, 0.35)`;
  const inset = Math.round((ICON_INSET * frame) / ICON_FRAME);

  let coverSrc: string;
  let coverDimensions: ImageDimensions | null = null;
  let overlayColor = "rgba(41, 37, 36, 0.6)";
  /** Set only for the fallback board: a flat dark wash replaces the blurred
   * copy of the cover behind it. */
  let backdropColor: string | null = null;

  const coverBuffer = book.coverUrl
    ? await fetchExternalImage(book.coverUrl)
    : null;

  if (coverBuffer) {
    coverSrc = arrayBufferToDataUri(coverBuffer);
    const [dimensions, avgColor] = await Promise.all([
      getImageDimensions(coverBuffer),
      getAverageImageColor(coverBuffer),
    ]);
    coverDimensions = dimensions;
    if (avgColor) {
      overlayColor = getTextColorAndOverlay(
        calculateLuminance(avgColor.r, avgColor.g, avgColor.b),
      ).overlayColor;
    }
  } else {
    // A board in the jacket's own color, tinted the way a real cover of that
    // luminance would be, so a dead cover host still yields this book's tab
    // icon rather than a gray one.
    coverSrc = generateFallbackCoverSvg(book.title, { color: book.coverColor });
    backdropColor = coverBackdropColor(book.coverColor ?? null) ?? "#3a3633";
    overlayColor = "rgba(0, 0, 0, 0)";
  }

  const cover = fitCoverInFrame(coverDimensions, frame, inset);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          // The corner every tab icon shares
          overflow: "hidden",
          borderRadius: Math.round(frame * TILE_RADIUS),
        }}
      >
        {/* Blurred backdrop: the cover itself, scaled past the frame so
            the blur's faded edge never shows; a flat dark wash of the jacket
            color when there is no cover to blur */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            // Only when set: satori throws on an undefined style value,
            // and it throws while the body streams, past the try/catch
            ...(backdropColor !== null && { backgroundColor: backdropColor }),
          }}
        >
          {backdropColor === null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverSrc}
              alt=""
              width={frame}
              height={frame}
              style={{
                objectFit: "cover",
                filter: `blur(${backdropBlur}px)`,
                transform: `scale(${backdropScale})`,
              }}
            />
          )}
        </div>

        {/* Same tint the OG card lays over its backdrop, so the sharp
            cover reads against a quieter version of itself */}
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

        {/* The whole cover, fitted to its own ratio */}
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              width: `${cover.width}px`,
              height: `${cover.height}px`,
              borderRadius: `${cover.radius}px`,
              overflow: "hidden",
              boxShadow: coverShadow,
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverSrc}
              alt=""
              width={cover.width}
              height={cover.height}
              style={{ objectFit: "cover" }}
            />
          </div>
        </div>
      </div>
    ),
    { width: frame, height: frame },
  );
}

/** What a missing or unreadable book gets: the page background, rounded like the rest. */
export function blankBookIconImage(frame = ICON_FRAME): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#f5f5f5",
          borderRadius: Math.round(frame * TILE_RADIUS),
        }}
      />
    ),
    { width: frame, height: frame },
  );
}
