"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

import type { PersonalityData } from "../types";

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = 100;
const LEVELS = 5;

function polarToCartesian(
  angle: number,
  radius: number,
): { x: number; y: number } {
  // Start from top (-90 degrees)
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
}

export default function PersonalityRadar({
  data,
}: {
  data: PersonalityData["bigFive"];
}) {
  const ref = useRef<SVGSVGElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const count = data.length;
  const angleStep = 360 / count;

  // Build the data polygon path
  const dataPoints = data.map((d, i) => {
    const score = d.score / d.max;
    return polarToCartesian(i * angleStep, RADIUS * score);
  });
  const dataPath =
    dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") +
    " Z";

  return (
    <div className="flex flex-col items-center gap-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Big Five Personality
      </h3>
      <svg
        ref={ref}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[280px]"
      >
        {/* Grid levels */}
        {Array.from({ length: LEVELS }, (_, level) => {
          const r = (RADIUS / LEVELS) * (level + 1);
          const points = Array.from({ length: count }, (_, i) =>
            polarToCartesian(i * angleStep, r),
          );
          const path =
            points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
              .join(" ") + " Z";
          return (
            <path
              key={level}
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.5}
              className="text-muted-foreground/15"
            />
          );
        })}

        {/* Axis lines */}
        {data.map((_, i) => {
          const end = polarToCartesian(i * angleStep, RADIUS);
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={end.x}
              y2={end.y}
              stroke="currentColor"
              strokeWidth={0.5}
              className="text-muted-foreground/15"
            />
          );
        })}

        {/* Data polygon */}
        <motion.path
          d={dataPath}
          fill="currentColor"
          fillOpacity={0.1}
          stroke="currentColor"
          strokeWidth={2}
          className="text-blue-500 dark:text-blue-400"
          initial={{ pathLength: 0, fillOpacity: 0 }}
          animate={
            isInView
              ? { pathLength: 1, fillOpacity: 0.1 }
              : { pathLength: 0, fillOpacity: 0 }
          }
          transition={{ duration: 1, ease: "easeOut" }}
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="currentColor"
            className="text-blue-500 dark:text-blue-400"
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : { scale: 0 }}
            transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }}
          />
        ))}

        {/* Labels */}
        {data.map((d, i) => {
          const labelRadius = RADIUS + 24;
          const pos = polarToCartesian(i * angleStep, labelRadius);
          return (
            <text
              key={i}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted-foreground text-[11px]"
            >
              <tspan>{d.trait}</tspan>
              <tspan
                x={pos.x}
                dy="14"
                className="fill-muted-foreground/60 text-[10px]"
              >
                {d.score}/{d.max}
              </tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}
