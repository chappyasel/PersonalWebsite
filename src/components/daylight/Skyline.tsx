import { SKYLINE_SHAPES, SKYLINE_VIEWBOX } from "./skylineGeometry";

/**
 * The dome shader's own SF traverse, generated into skylineGeometry.ts by
 * scripts/generate/skyline-silhouette.ts. The viewBox keeps the dome's
 * angular aspect, so the drawing scales uniformly with the hero width; color
 * comes from the parent via currentColor.
 */
export default function Skyline() {
  return (
    <svg viewBox={SKYLINE_VIEWBOX} fill="currentColor" aria-hidden>
      {SKYLINE_SHAPES.map((shape, i) => {
        if (shape.kind === "rect") {
          return (
            <rect
              key={i}
              x={shape.x}
              y={shape.y}
              width={shape.w}
              height={shape.h}
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
              stroke="currentColor"
              strokeWidth={shape.width}
              strokeOpacity={shape.opacity}
            />
          );
        }
        return <path key={i} d={shape.d} fillOpacity={shape.opacity} />;
      })}
    </svg>
  );
}
