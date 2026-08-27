import { SKYLINE_SHAPES, SKYLINE_VIEWBOX } from "./skylineGeometry";

/**
 * The surveyed east-facing traverse, drawn from the shared geometry in
 * skylineGeometry.ts (which documents the survey and the 1:1 desktop scale).
 * `preserveAspectRatio="none"` lets narrower viewports compress the drawing
 * into a finer distant city; color comes from the parent via currentColor.
 */
export default function Skyline() {
  return (
    <svg
      viewBox={SKYLINE_VIEWBOX}
      preserveAspectRatio="none"
      fill="currentColor"
      aria-hidden
    >
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
