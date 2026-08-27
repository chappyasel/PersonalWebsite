import { SKYLINE_SHAPES, SKYLINE_VIEWBOX } from "./skylineGeometry";

/**
 * The dome shader's own SF traverse, generated into skylineGeometry.ts by
 * scripts/generate/skyline-silhouette.ts. The viewBox keeps the dome's
 * angular aspect, so the drawing scales uniformly with the hero width; color
 * comes from the parent via currentColor — except the Golden Gate, which
 * wears its International Orange (--dl-ggb) the way the dome paints it.
 */
export default function Skyline() {
  return (
    <svg viewBox={SKYLINE_VIEWBOX} fill="currentColor" aria-hidden>
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
    </svg>
  );
}
