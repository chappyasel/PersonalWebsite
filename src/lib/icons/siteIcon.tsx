import { ImageResponse } from "next/og";

import { DAYLIGHT, skyline } from "~/lib/og/daylight";
import { phosphorSvg } from "~/lib/og/phosphor";

import { loadPublicImage } from "./publicImage";
import { type SiteIconSpec } from "./sectionIcons";
import { SITE_ICON_SIZES, TILE_RADIUS, siteIconFrame } from "./siteIconSizes";
import {
  ICON_BRIDGE_COLOR,
  ICON_HILL_COLOR,
  ICON_SKYLINE_SHAPES,
  SKY_CARD,
  skylinePlacement,
} from "./skyCard";

/**
 * A section's PNG icon, light scheme only: Safari tabs (which ignore SVG
 * favicons) and home screens (which mask a static tile) are the only
 * readers. The SVG favicon in siteIconSvg.ts is where the night lives.
 *
 * Glyph sections draw a section-colored sky, ember, and the surveyed
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
  const glyphOffset = (frame - glyphSize) / 2;
  const color = spec.color.light;
  const strip = skylinePlacement(frame);
  const [skyTop, skyMid, skyLow] = spec.background.light;

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
          background: `linear-gradient(180deg, ${skyTop} 0%, ${skyMid} 60%, ${skyLow} 100%)`,
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
        <svg
          width={frame}
          height={frame}
          viewBox="0 0 1 1"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <g fill="#fff" opacity={SKY_CARD.cloudOpacity}>
            {SKY_CARD.clouds.map((cloud, index) => (
              <ellipse key={index} {...cloud} />
            ))}
          </g>
        </svg>
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
          {skyline(strip.width, {
            shapes: ICON_SKYLINE_SHAPES,
            bridgeColor: ICON_BRIDGE_COLOR.light,
            silhouetteColor: ICON_HILL_COLOR.light,
          })}
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
            weight: frame >= SITE_ICON_SIZES.app ? "duotone" : "bold",
            color,
          })}
        </div>
      </div>
    ),
    size,
  );
}
