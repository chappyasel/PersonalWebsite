import styles from "./direct.module.css";
import type { Trait } from "./model";
import { traitColors } from "./model";

export default function PairedCurve({
  trait,
  left,
  right,
  extent,
}: {
  trait: Trait;
  left: { name: string; z: number };
  right: { name: string; z: number };
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
  return (
    <svg
      viewBox="0 0 680 165"
      className={styles.pairedCurve}
      role="img"
      aria-label={`${trait} bell curve: ${left.name} at ${left.z.toFixed(2)} standard deviations, ${right.name} at ${right.z.toFixed(2)} standard deviations`}
    >
      <title>{`${trait}: both results on the reference bell curve`}</title>
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
          <text x={x(z)} y={146} textAnchor="middle">
            {z === 0 ? "Mean" : `${z > 0 ? "+" : ""}${z} SD`}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      {[
        { ...left, color: "#182a2a", shape: "circle" },
        { ...right, color: "#398b82", shape: "diamond" },
      ].map((person) => (
        <g key={person.shape}>
          <line
            x1={x(person.z)}
            x2={x(person.z)}
            y1={y(person.z)}
            y2={baseline}
            stroke={person.color}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          {person.shape === "circle" ? (
            <circle
              cx={x(person.z)}
              cy={y(person.z)}
              r={6}
              fill={person.color}
              stroke="white"
              strokeWidth={1.5}
            />
          ) : (
            <path
              d={`M${x(person.z)},${y(person.z) - 7} l7,7 l-7,7 l-7,-7 Z`}
              fill={person.color}
              stroke="white"
              strokeWidth={1.5}
            />
          )}
          <title>
            {`${person.name}: ${person.z.toFixed(2)} SD from the reference mean`}
          </title>
        </g>
      ))}
    </svg>
  );
}
