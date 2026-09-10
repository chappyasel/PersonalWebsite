import { phaseColorStops } from "~/lib/weight-log/presentation";
import type { WeightLog } from "~/lib/weight-log/schema";

// Recharts Customized supplies the resolved axis, including responsive sizing.
// User-space coordinates also color horizontal lines and sparse series correctly.
export function PhaseGradient({
  id,
  phases,
  bounds,
  xAxisMap,
}: {
  id: string;
  phases: WeightLog["phases"];
  bounds: [number, number];
  xAxisMap?: Record<string, { scale: (value: number) => number }>;
}) {
  const axis = xAxisMap?.["0"];
  if (!axis) return null;
  const x1 = axis.scale(bounds[0]);
  const x2 = axis.scale(bounds[1]);
  return (
    <defs>
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={x1}
        x2={x2 === x1 ? x1 + 1 : x2}
        y1={0}
        y2={0}
      >
        {phaseColorStops(phases, bounds).map((stop, index) => (
          <stop key={index} offset={stop.offset} stopColor={stop.color} />
        ))}
      </linearGradient>
    </defs>
  );
}
