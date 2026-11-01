"use client";

import {
  BLINKER_EM,
  BLINKER_LOCAL_PER_EM,
  COORDINATION_DUST_COLORS,
  COORDINATION_DUST_COUNT,
  DUST_LOCAL_PER_PX,
  createCoordinationDust,
} from "../scene/coordinationDust";
import { useId } from "react";

const TWINKLE_GROUPS = 3;
const TWINKLE_STAGGER_S = 0.8;
/** Grains past this share of the sphere would sit on its dissolving edge, which
 * the 3D orb's stencil clips and flat SVG cannot. */
const SILHOUETTE_SHARE = 0.88;
const GRAIN_RADIUS = 0.00235;

/** The page's three box-shadows: blur radius over two is sigma, plus opacity. */
const GLOW_LAYERS = [
  { result: "near", sigmaEm: 0.08, opacity: 0.8 },
  { result: "mid", sigmaEm: 0.28, opacity: 0.46 },
  { result: "far", sigmaEm: 0.75, opacity: 0.22 },
] as const;
const GLOW_REACH_EM = 3;

/** A fixed seed, because the server and the browser must draw the same cloud. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const DUST = createCoordinationDust(
  COORDINATION_DUST_COUNT,
  seededRandom(0xc0d05),
);
const GRAINS = Array.from({ length: DUST.count }, (_, index) => {
  const [r, g, b] = COORDINATION_DUST_COLORS[DUST.kind[index]!]!;
  return {
    x: DUST.position[index * 3]! * DUST_LOCAL_PER_PX,
    y: DUST.position[index * 3 + 1]! * DUST_LOCAL_PER_PX,
    size: DUST.size[index]!,
    opacity: DUST.peak[index]!,
    fill: `rgb(${r} ${g} ${b})`,
  };
});

const svgNumber = (value: number) => value.toFixed(3);

/** The 3D dust orb's flat twin, drawn around the sphere's centre: the same
 * grains, turning and twinkling on CSS alone, around the page's blinker. */
export function CoordinationDustGlyph({
  centerY,
  pixels,
  globeRadius,
}: {
  centerY: number;
  pixels: number;
  globeRadius: number;
}) {
  const filterId = `stacks-boot-blinker-glow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const em = BLINKER_LOCAL_PER_EM * pixels;
  const block = {
    x: svgNumber((-BLINKER_EM.width / 2) * em),
    y: svgNumber((-BLINKER_EM.height / 2) * em),
    width: svgNumber(BLINKER_EM.width * em),
    height: svgNumber(BLINKER_EM.height * em),
  };
  const grains = GRAINS.filter(
    ({ x, y }) => Math.hypot(x, y) * pixels < globeRadius * SILHOUETTE_SHARE,
  );
  return (
    <g
      transform={`translate(0 ${svgNumber(centerY)})`}
      data-boot-coordination-dust={grains.length}
    >
      <g className="stacks-boot-coordination-dust">
        {Array.from({ length: TWINKLE_GROUPS }, (_, group) => (
          <g
            className="stacks-boot-coordination-dust-twinkle"
            key={group}
            style={{ animationDelay: `${group * -TWINKLE_STAGGER_S}s` }}
          >
            {grains
              .filter((_, index) => index % TWINKLE_GROUPS === group)
              .map(({ x, y, size, opacity, fill }, index) => (
                <circle
                  key={index}
                  cx={svgNumber(x * pixels)}
                  cy={svgNumber(-y * pixels)}
                  r={svgNumber(GRAIN_RADIUS * size * pixels)}
                  fill={fill}
                  fillOpacity={svgNumber(opacity)}
                />
              ))}
          </g>
        ))}
      </g>
      <filter
        id={filterId}
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
        x={svgNumber(-GLOW_REACH_EM * em)}
        y={svgNumber(-GLOW_REACH_EM * em)}
        width={svgNumber(GLOW_REACH_EM * 2 * em)}
        height={svgNumber(GLOW_REACH_EM * 2 * em)}
      >
        {GLOW_LAYERS.flatMap(({ result, sigmaEm, opacity }) => [
          <feGaussianBlur
            key={`${result}-blur`}
            in="SourceGraphic"
            stdDeviation={svgNumber(sigmaEm * em)}
            result={`${result}-blur`}
          />,
          <feComponentTransfer
            key={result}
            in={`${result}-blur`}
            result={result}
          >
            <feFuncA type="linear" slope={opacity} />
          </feComponentTransfer>,
        ])}
        <feMerge result="glow">
          {GLOW_LAYERS.map(({ result }) => (
            <feMergeNode key={result} in={result} />
          ))}
        </feMerge>
        {/* A box-shadow paints only outside its box, which is what leaves the
            middle empty while the glow lingers through the off beat. */}
        <feComposite in="glow" in2="SourceAlpha" operator="out" />
      </filter>
      <rect
        className="stacks-boot-coordination-blinker-glow"
        filter={`url(#${filterId})`}
        {...block}
      />
      <rect className="stacks-boot-coordination-blinker-block" {...block} />
    </g>
  );
}
