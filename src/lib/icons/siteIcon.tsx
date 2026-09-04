import { ImageResponse } from "next/og";

import { DAYLIGHT, skyline } from "~/lib/og/daylight";
import { phosphorSvg } from "~/lib/og/phosphor";

import { loadPublicImage } from "./publicImage";
import { type SiteIconSpec } from "./sectionIcons";
import { SITE_ICON_SIZES, siteIconFrame, TILE_RADIUS } from "./siteIconSizes";
import { SKY_CARD, skylinePlacement } from "./skyCard";

/**
 * A section's PNG icon, light scheme only: Safari tabs (which ignore SVG
 * favicons) and home screens (which mask a static tile) are the only
 * readers. The SVG favicon in siteIconSvg.ts is where the night lives.
 *
 * Glyph sections draw the sky card: day sky, sun, ember, and the surveyed
 * skyline through the Golden Gate window, with the glyph over it. Image
 * sections clip their raster mark to the same corner. `id` is what Next
 * hands the icon route: a promise of the `generateImageMetadata` id, so it
 * is awaited here rather than in every section's icon.tsx.
 */
export async function siteIconImage(
  id: string | Promise<string>,
  spec: SiteIconSpec,
): Promise<ImageResponse> {
  const frame = siteIconFrame(await id);
  const radius = Math.round(frame * TILE_RADIUS);
  const size = { width: frame, height: frame };

  if (spec.kind === "image") {
    const src = await loadPublicImage(spec.light.png);
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            borderRadius: radius,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            width={frame}
            height={frame}
            style={{ width: frame, height: frame, objectFit: "cover" }}
          />
        </div>
      ),
      size,
    );
  }

  const glyphSize = Math.round(frame * SKY_CARD.glyph.size);
  const glyphOffset = Math.round(frame * SKY_CARD.glyph.offset);
  const color = spec.color.light;
  const strip = skylinePlacement(frame);
  const disc = SKY_CARD.disc;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          borderRadius: radius,
          background: `linear-gradient(180deg, ${DAYLIGHT.skyTop} 0%, #3a7fb3 60%, ${DAYLIGHT.skyLow} 100%)`,
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "70%",
            background: `radial-gradient(50% 60% at 91% 100%, ${DAYLIGHT.skyEmber}cc, ${DAYLIGHT.skyEmber}00 70%)`,
          }}
        />
        {/* The sun, with its haze */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: frame * (disc.x - disc.halo),
            top: frame * (disc.y - disc.halo),
            width: frame * disc.halo * 2,
            height: frame * disc.halo * 2,
            borderRadius: 999,
            backgroundColor: "rgba(255, 245, 214, 0.3)",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: frame * (disc.x - disc.r),
            top: frame * (disc.y - disc.r),
            width: frame * disc.r * 2,
            height: frame * disc.r * 2,
            borderRadius: 999,
            backgroundColor: "#fff6dc",
          }}
        />
        {/* The skyline strip, slid so the Golden Gate window fills the tile */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: strip.left,
            top: strip.top + 1,
            width: strip.width,
            height: strip.height,
          }}
        >
          {skyline(strip.width)}
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: glyphOffset,
            top: glyphOffset,
            color,
          }}
        >
          {phosphorSvg(spec.glyph, {
            size: glyphSize,
            weight: frame >= SITE_ICON_SIZES.app ? "duotone" : "fill",
            color,
          })}
        </div>
      </div>
    ),
    size,
  );
}
