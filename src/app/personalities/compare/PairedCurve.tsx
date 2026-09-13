import styles from "./direct.module.css";
import type { Trait } from "./model";
import { traitColors } from "./model";

export default function PairedCurve({
  trait,
  left,
  right,
  extent,
  anonymous = [],
}: {
  trait: Trait;
  left: { name: string; z: number };
  right?: { name: string; z: number };
  anonymous?: number[];
  extent: number;
}) {
  const x = (z: number) => 40 + ((z + extent) / (2 * extent)) * 600;
  const baseline = 118;
  const y = (z: number) => baseline - Math.exp((-z * z) / 2) * 88;
  const path = Array.from({ length: 161 }, (_, i) => {
    const z = -extent + (i / 160) * extent * 2;
    return `${i ? "L" : "M"}${x(z)},${y(z)}`;
  }).join(" ");
  const color = traitColors[trait];
  const points = [
    { ...left, color: "#182a2a", shape: "circle", named: true },
    ...(right
      ? [{ ...right, color: "#398b82", shape: "diamond", named: true }]
      : []),
    ...anonymous.map((z) => ({
      name: "Unnamed person",
      z,
      color: "#8a9292",
      shape: "circle",
      named: false,
    })),
  ];
  // Use the same collision-free bottom lanes as the all-traits view.
  const lanes: number[][] = [];
  const plotted = points
    .sort((a, b) => a.z - b.z)
    .map((point) => {
      const px = x(point.z);
      let lane = lanes.findIndex((values) =>
        values.every((previous) => Math.abs(previous - px) > 17),
      );
      if (lane < 0) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane]!.push(px);
      return { ...point, px, py: baseline + 25 + lane * 17 };
    });
  const chartHeight = baseline + Math.max(1, lanes.length) * 17 + 65;
  return (
    <svg
      viewBox={`0 0 680 ${chartHeight}`}
      className={styles.pairedCurve}
      role="img"
      aria-label={`${trait} bell curve: ${left.name} at ${left.z.toFixed(2)} standard deviations${right ? `, ${right.name} at ${right.z.toFixed(2)} standard deviations` : ""}${anonymous.length ? `, with ${anonymous.length} unnamed people shown as gray dots` : ""}. Dots are below the curve.`}
    >
      <title>{`${trait}: ${right ? "both results" : "shared result"} on the reference bell curve`}</title>
      <path
        d={`${path} L640,${baseline} L40,${baseline} Z`}
        fill={color}
        opacity={0.08}
      />
      <rect
        x={x(-1)}
        y={20}
        width={x(1) - x(-1)}
        height={baseline - 20}
        fill={color}
        opacity={0.04}
      />
      {[-3, -2, -1, 0, 1, 2, 3].map((z) => (
        <g key={z} className={styles.grid}>
          <line
            x1={x(z)}
            x2={x(z)}
            y1={20}
            y2={baseline}
            style={{ strokeDasharray: z === 0 ? "none" : undefined }}
          />
          <text x={x(z)} y={chartHeight - 16} textAnchor="middle">
            {z === 0 ? "Mean" : `${z > 0 ? "+" : ""}${z} SD`}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      <line
        x1={40}
        x2={640}
        y1={baseline}
        y2={baseline}
        stroke="currentColor"
        opacity={0.2}
      />
      {plotted.map((point, index) => (
        <g key={index}>
          {point.named && (
            <line
              x1={point.px}
              x2={point.px}
              y1={y(point.z)}
              y2={point.py - 8}
              stroke={point.color}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}
          {point.shape === "diamond" ? (
            <path
              d={`M${point.px},${point.py - 7} l7,7 l-7,7 l-7,-7 Z`}
              fill={point.color}
              stroke="white"
              strokeWidth={1.5}
            />
          ) : (
            <circle
              cx={point.px}
              cy={point.py}
              r={point.named ? 6 : 4.5}
              fill={point.color}
              fillOpacity={point.named ? 1 : 0.7}
              stroke="white"
              strokeWidth={point.named ? 1.5 : 1}
            />
          )}
          <title>{`${point.name}: ${point.z.toFixed(2)} SD from the reference mean`}</title>
        </g>
      ))}
    </svg>
  );
}
