"use client";

import { useEffect, useImperativeHandle, useRef } from "react";

import type { FireworksEngine } from "~/components/daylight/fireworksEngine";
import {
  SKYLINE_NIGHT,
  SKYLINE_SHAPES,
  SKYLINE_VIEWBOX,
  type SkylineNightShape,
  type SkylineShape,
} from "~/components/daylight/skylineGeometry";

import c from "./confirmed.module.css";

/** The night paint, baked: the back of the ticket is always night. */
const GROUND = "#141b2b";
const BRIDGE = "#a63a46";
const WINDOW = "#ffbe73";

export type BackSkylineHandle = { fire: () => void };

/** Which depth a night light belongs to: the bridge's lamps and beacons
 * ride the bridge, everything else the city. */
const onBridge = (s: SkylineNightShape) =>
  s.kind === "stroke" || (s.tone === "beacon" && s.x < 400);

/**
 * The ticket back's San Francisco in three depths, the bridge farthest,
 * then the ridge, then the city, each sliding its own amount as the ticket
 * tilts (CSS, off --tx and --ty). The bridge's fireworks, the daylight
 * pages' own, burst behind it and ride with it.
 */
export function BackSkyline({ ref }: { ref: React.Ref<BackSkylineHandle> }) {
  const strip = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const bloom = useRef<HTMLCanvasElement>(null);
  const core = useRef<HTMLCanvasElement>(null);
  const engine = useRef<FireworksEngine | null>(null);
  const loading = useRef(false);
  const pending = useRef(0);

  useImperativeHandle(ref, () => ({
    fire() {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (engine.current) {
        engine.current.fire();
        return;
      }
      pending.current += 1;
      if (loading.current) return;
      loading.current = true;
      void import("~/components/daylight/fireworksEngine").then((m) => {
        if (!layer.current || !bloom.current || !core.current) return;
        engine.current = m.createFireworksEngine(
          layer.current,
          bloom.current,
          core.current,
          { strip: strip.current ?? undefined, dark: true, layout: true },
        );
        const queued = Math.min(pending.current, 4);
        pending.current = 0;
        for (let i = 0; i < queued; i++) engine.current.fire();
      });
    },
  }));

  useEffect(() => () => engine.current?.dispose(), []);

  return (
    <div aria-hidden className={c.backScene}>
      <div ref={layer} className={c.backFireworks}>
        <canvas ref={bloom} className={c.backBloom} />
        <canvas ref={core} className={c.backCore} />
      </div>
      <div ref={strip} className={cnStrip(c.backBridge)}>
        <svg viewBox={SKYLINE_VIEWBOX}>
          {SKYLINE_SHAPES.filter((s) => s.tone === "ggb").map((s, i) => (
            <Shape key={i} shape={s} paint={BRIDGE} />
          ))}
          {SKYLINE_NIGHT.filter(onBridge).map((s, i) => (
            <Light key={i} shape={s} />
          ))}
        </svg>
      </div>
      <div className={cnStrip(c.backRidge)}>
        <svg viewBox={SKYLINE_VIEWBOX}>
          {SKYLINE_SHAPES.filter(isRidge).map((s, i) => (
            <Shape key={i} shape={s} paint={GROUND} />
          ))}
        </svg>
      </div>
      <div className={cnStrip(c.backCity)}>
        <svg viewBox={SKYLINE_VIEWBOX}>
          {SKYLINE_SHAPES.filter((s) => s.tone !== "ggb" && !isRidge(s)).map(
            (s, i) => (
              <Shape key={i} shape={s} paint={GROUND} />
            ),
          )}
          {SKYLINE_NIGHT.filter((s) => !onBridge(s)).map((s, i) => (
            <Light key={i} shape={s} />
          ))}
        </svg>
      </div>
    </div>
  );
}

const cnStrip = (depth: string | undefined) => `${c.backStrip} ${depth}`;

/** The hazy far ridge the bridge comes through. */
const isRidge = (s: SkylineShape) =>
  s.kind === "fill" && !s.tone && (s.opacity ?? 1) < 0.7;

function Shape({ shape, paint }: { shape: SkylineShape; paint: string }) {
  if (shape.kind === "rect")
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        fill={paint}
        fillOpacity={shape.opacity}
      />
    );
  if (shape.kind === "stroke")
    return (
      <path
        d={shape.d}
        fill="none"
        stroke={paint}
        strokeWidth={shape.width}
        strokeOpacity={shape.opacity}
      />
    );
  return <path d={shape.d} fill={paint} fillOpacity={shape.opacity} />;
}

function Light({ shape }: { shape: SkylineNightShape }) {
  if (shape.kind === "stroke")
    return (
      <path
        className={c.backLamps}
        d={shape.d}
        fill="none"
        strokeWidth={shape.width}
      />
    );
  if (shape.kind === "dot")
    return (
      <circle
        className={shape.tone === "beacon" ? c.backBeacon : undefined}
        cx={shape.x}
        cy={shape.y}
        r={shape.r}
        fill={shape.tone === "beacon" ? "#e61f1a" : WINDOW}
        opacity={shape.tone === "beacon" ? undefined : 0.8}
      />
    );
  return (
    <rect
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      fill={shape.tone === "crown" ? "#c7b39e" : WINDOW}
      opacity={shape.tone === "crown" ? 0.5 : 0.8}
    />
  );
}
