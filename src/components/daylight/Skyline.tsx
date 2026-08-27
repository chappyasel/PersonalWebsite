import {
  MOON,
  SKYLINE_NIGHT,
  SKYLINE_SHAPES,
  SKYLINE_VIEWBOX,
} from "./skylineGeometry";

/**
 * The dome shader's own SF traverse, generated into skylineGeometry.ts by
 * scripts/generate/skyline-silhouette.ts. The viewBox keeps the dome's
 * angular aspect, so the drawing scales uniformly with the hero width; color
 * comes from the parent via currentColor — except the Golden Gate, which
 * wears its International Orange (--dl-ggb) the way the dome paints it.
 *
 * The night layer is generated too: the moon rides behind the buildings
 * (dark theme), the shader's fixed-hash windows glint in both themes (a city
 * at 3:45 has a few lights on), and dark adds the Bay Lights, the Golden
 * Gate's deck lamps and aviation beacons, and Salesforce's Day-for-Night
 * crown. Theme gating, colors, and every animation live in daylight.css.
 */
export default function Skyline() {
  return (
    <svg viewBox={SKYLINE_VIEWBOX} fill="currentColor" aria-hidden>
      <defs>
        <radialGradient id="dl-moon-disc-g">
          <stop offset="0%" stopColor="#d9d8cb" />
          <stop offset="72%" stopColor="#c4cbd8" />
          <stop offset="100%" stopColor="#aeb8c9" />
        </radialGradient>
        <radialGradient id="dl-moon-halo-g">
          <stop offset="0%" stopColor="#6b80a8" stopOpacity="0.3" />
          <stop offset="55%" stopColor="#6b80a8" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#6b80a8" stopOpacity="0" />
        </radialGradient>
        {/* The halo's lower half dies out before the roofline: the opaque
            building/ground fill would otherwise cut the radial glow on a
            hard straight edge (the hero's fog hides that seam; the quiet
            footer has no fog to hide it behind). */}
        <linearGradient
          id="dl-moon-halo-fade"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={MOON.y}
          x2="0"
          y2={MOON.y + MOON.r * 2.9}
        >
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </linearGradient>
        <mask id="dl-moon-halo-m">
          <rect
            x={MOON.x - MOON.r * 3.8}
            y={MOON.y - MOON.r * 3.8}
            width={MOON.r * 7.6}
            height={MOON.r * 7.6}
            fill="url(#dl-moon-halo-fade)"
          />
        </mask>
      </defs>
      <g className="dl-night-back">
        <circle
          cx={MOON.x}
          cy={MOON.y}
          r={MOON.r * 3.8}
          fill="url(#dl-moon-halo-g)"
          mask="url(#dl-moon-halo-m)"
        />
        <circle cx={MOON.x} cy={MOON.y} r={MOON.r} fill="url(#dl-moon-disc-g)" />
      </g>
      {SKYLINE_SHAPES.map((shape, i) => {
        const paint =
          shape.tone === "ggb" ? "hsl(var(--dl-ggb))" : "currentColor";
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
      <g className="dl-night-front">
        {SKYLINE_NIGHT.map((shape, i) => {
          if (shape.kind === "stroke") {
            return (
              <path
                key={i}
                className="dl-lamps"
                d={shape.d}
                fill="none"
                strokeWidth={shape.width}
              />
            );
          }
          if (shape.kind === "dot") {
            return (
              <circle
                key={i}
                className={shape.tone === "beacon" ? "dl-beacon" : "dl-bay"}
                cx={shape.x}
                cy={shape.y}
                r={shape.r}
                style={
                  shape.phase !== undefined
                    ? { animationDelay: `${(-shape.phase * 12.57).toFixed(2)}s` }
                    : undefined
                }
              />
            );
          }
          if (shape.tone === "crown") {
            return (
              <rect
                key={i}
                className="dl-crown"
                x={shape.x}
                y={shape.y}
                width={shape.w}
                height={shape.h}
              />
            );
          }
          const slow = shape.tone === "window-slow";
          return (
            <rect
              key={i}
              className={slow ? "dl-w dl-w-slow" : "dl-w"}
              x={shape.x}
              y={shape.y}
              width={shape.w}
              height={shape.h}
              style={
                slow && shape.phase !== undefined
                  ? {
                      // The hash is the window's identity; spread it across the
                      // turnover cycle so no two windows switch together.
                      animationDelay: `${(-((shape.phase * 997) % 1) * 126).toFixed(1)}s`,
                    }
                  : undefined
              }
            />
          );
        })}
      </g>
    </svg>
  );
}
