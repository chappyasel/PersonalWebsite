import {
  SKYLINE_NIGHT,
  SKYLINE_SHAPES,
  SKYLINE_VIEWBOX,
} from "~/components/daylight/skylineGeometry";
import { NIGHT } from "~/lib/og/daylight";

/**
 * The surveyed skyline, once, as two SVG symbols the document covers share:
 * the silhouette with the Golden Gate, and the night layer (windows, Bay
 * Lights, deck lamps, beacons, the Salesforce crown). Each cover draws it
 * with `<use>`, so three cards cost one copy of the 20 KB of geometry, and
 * the copy stays server-rendered: this file never enters the client bundle.
 *
 * Colour comes from the referencing element: `currentColor` for the
 * silhouette and `--doc-ggb` for the bridge, both set on the cover's svg.
 * The symbols pin their own alignment (bottom-left) so a narrow cover shows
 * the bridge and lets downtown run off the right edge.
 */
export default function DocSkylineDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <symbol
        id="doc-skyline"
        viewBox={SKYLINE_VIEWBOX}
        preserveAspectRatio="xMinYMax meet"
      >
        {SKYLINE_SHAPES.map((shape, i) => {
          const paint =
            shape.tone === "ggb" ? "var(--doc-ggb, currentColor)" : "currentColor";
          if (shape.kind === "rect") {
            return (
              <rect
                key={i}
                x={shape.x}
                y={shape.y}
                width={shape.w}
                height={shape.h}
                fill={paint}
                fillOpacity={shape.opacity}
              />
            );
          }
          if (shape.kind === "stroke") {
            return (
              <path
                key={i}
                d={shape.d}
                fill="none"
                stroke={paint}
                strokeWidth={shape.width}
                strokeOpacity={shape.opacity}
              />
            );
          }
          return (
            <path key={i} d={shape.d} fill={paint} fillOpacity={shape.opacity} />
          );
        })}
      </symbol>
      <symbol
        id="doc-skyline-lights"
        viewBox={SKYLINE_VIEWBOX}
        preserveAspectRatio="xMinYMax meet"
      >
        {SKYLINE_NIGHT.map((shape, i) => {
          if (shape.kind === "stroke") {
            return (
              <path
                key={i}
                d={shape.d}
                fill="none"
                stroke={NIGHT.lamp}
                strokeWidth={shape.width}
                strokeDasharray="2 1.6"
                strokeOpacity={0.55}
              />
            );
          }
          if (shape.kind === "dot") {
            return (
              <circle
                key={i}
                cx={shape.x}
                cy={shape.y}
                r={shape.r}
                fill={shape.tone === "beacon" ? NIGHT.beacon : NIGHT.window}
                fillOpacity={shape.tone === "beacon" ? 0.8 : 0.85}
              />
            );
          }
          return (
            <rect
              key={i}
              x={shape.x}
              y={shape.y}
              width={shape.w}
              height={shape.h}
              fill={shape.tone === "crown" ? NIGHT.crown : NIGHT.window}
              fillOpacity={shape.tone === "crown" ? 0.5 : 0.8}
            />
          );
        })}
      </symbol>
    </svg>
  );
}
