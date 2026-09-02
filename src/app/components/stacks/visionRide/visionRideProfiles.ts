import type { PixelLook } from "../scene/pixelArt";
import {
  VISION_RIDE_PALETTE,
  type VisionRidePalette,
} from "./visionRidePalette";

export const VISION_RIDE_MODIFIERS = ["night", "redline", "golf"] as const;
export type VisionRideModifier = (typeof VISION_RIDE_MODIFIERS)[number];

export type VisionRideModifiers = Readonly<
  Record<VisionRideModifier, boolean>
>;

export type VisionRideSessionProfile = VisionRideModifiers &
  Readonly<{ pixelLook: PixelLook }>;

export const EMPTY_VISION_RIDE_MODIFIERS: VisionRideModifiers = Object.freeze({
  night: false,
  redline: false,
  golf: false,
});

export const DEFAULT_VISION_RIDE_SESSION_PROFILE: VisionRideSessionProfile =
  Object.freeze({
    ...EMPTY_VISION_RIDE_MODIFIERS,
    pixelLook: "off",
  });

export type VisionRideProfile = Readonly<{
  palette: VisionRidePalette;
  speedMetresPerSecond: number;
  starCountScale: number;
  sunBaseScale: number;
  breath: Readonly<{
    halfCycleSeconds: number;
    sunGrowth: number;
    carGrowth: number;
  }>;
  parallaxScale: number;
  terrain: Readonly<{
    heightScale: number;
    gridCellXScale: number;
    gridCellYScale: number;
    lineWidthPx: number;
    lineOpacity: number;
  }>;
  sunStyle: Readonly<{
    bandCount: number;
    bandSpeed: number;
    grooveMin: number;
    grooveMax: number;
  }>;
  hemisphere: Readonly<{
    sky: string;
    ground: string;
    intensity: number;
  }>;
  directional: Readonly<{ color: string; intensity: number }>;
  point: Readonly<{ color: string; intensity: number }>;
  car: Readonly<{
    body: string;
    glass: string;
    wheel: string;
    weaveRate: number;
    weaveAmount: number;
    bounceRate: number;
    bounceAmount: number;
    rollRate: number;
    rollAmount: number;
  }>;
}>;

const NIGHT_PALETTE = {
  ...VISION_RIDE_PALETTE,
  skyTop: [0.0003, 0.001, 0.012],
  skyUpper: [0.002, 0.008, 0.04],
  skyViolet: [0.008, 0.03, 0.12],
  skyMagenta: [0.01, 0.1, 0.24],
  skyPink: [0.02, 0.22, 0.34],
  skyHorizon: [0.02, 0.55, 0.62],
  skyHorizonCrest: [0.08, 0.78, 0.66],
  skyBelow: [0.002, 0.015, 0.04],
  starCore: [0.68, 0.94, 1],
  starHero: [0.22, 0.72, 1],
  sunTop: [0.5, 0.95, 1],
  sunMiddle: [0.08, 0.45, 1],
  sunFoot: [0.1, 0.05, 0.5],
  sunGrooveTop: [0.02, 0.38, 0.72],
  sunGrooveBottom: [0.04, 0.02, 0.3],
  sunBevel: [0.2, 0.9, 1],
  surfaceBase: [0.002, 0.008, 0.03],
  surfaceBottom: [0.005, 0.03, 0.07],
  roadLine: [0.05, 0.9, 1],
} as const satisfies VisionRidePalette;

const REDLINE_PALETTE = {
  ...VISION_RIDE_PALETTE,
  skyTop: [0.008, 0.0002, 0.0002],
  skyUpper: [0.05, 0.001, 0.001],
  skyViolet: [0.18, 0.002, 0.006],
  skyMagenta: [0.65, 0.006, 0.008],
  skyPink: [1, 0.03, 0.005],
  skyHorizon: [1, 0.15, 0.01],
  skyHorizonCrest: [1, 0.35, 0.02],
  skyBelow: [0.06, 0.001, 0.001],
  starCore: [1, 0.78, 0.45],
  starHero: [1, 0.16, 0.02],
  sunTop: [1, 0.72, 0.08],
  sunMiddle: [1, 0.12, 0.01],
  sunFoot: [0.5, 0.001, 0.001],
  sunGrooveTop: [0.8, 0.08, 0.002],
  sunGrooveBottom: [0.22, 0.001, 0.001],
  sunBevel: [1, 0.34, 0.02],
  surfaceBase: [0.025, 0.001, 0.001],
  surfaceBottom: [0.11, 0.002, 0.001],
  roadLine: [1, 0.035, 0.005],
} as const satisfies VisionRidePalette;

const GOLF_PALETTE = {
  ...VISION_RIDE_PALETTE,
  skyTop: [0.004, 0.06, 0.1],
  skyUpper: [0.01, 0.18, 0.25],
  skyViolet: [0.02, 0.32, 0.34],
  skyMagenta: [0.07, 0.5, 0.34],
  skyPink: [0.32, 0.75, 0.34],
  skyHorizon: [0.7, 1, 0.35],
  skyHorizonCrest: [0.95, 1, 0.55],
  skyBelow: [0.005, 0.08, 0.025],
  starCore: [0.9, 1, 0.72],
  starHero: [0.52, 1, 0.38],
  sunTop: [0.98, 1, 0.62],
  sunMiddle: [0.62, 1, 0.22],
  sunFoot: [0.05, 0.42, 0.08],
  sunGrooveTop: [0.45, 0.82, 0.08],
  sunGrooveBottom: [0.02, 0.22, 0.04],
  sunBevel: [0.88, 1, 0.38],
  surfaceBase: [0.008, 0.05, 0.018],
  surfaceBottom: [0.025, 0.15, 0.04],
  roadLine: [0.48, 1, 0.22],
} as const satisfies VisionRidePalette;

const REDLINE_ACCENTS: Partial<VisionRidePalette> = {
  starCore: REDLINE_PALETTE.starCore,
  starHero: REDLINE_PALETTE.starHero,
  sunTop: REDLINE_PALETTE.sunTop,
  sunMiddle: REDLINE_PALETTE.sunMiddle,
  sunFoot: REDLINE_PALETTE.sunFoot,
  sunGrooveTop: REDLINE_PALETTE.sunGrooveTop,
  sunGrooveBottom: REDLINE_PALETTE.sunGrooveBottom,
  sunBevel: REDLINE_PALETTE.sunBevel,
  surfaceBase: REDLINE_PALETTE.surfaceBase,
  surfaceBottom: REDLINE_PALETTE.surfaceBottom,
  roadLine: REDLINE_PALETTE.roadLine,
};

const GOLF_ACCENTS: Partial<VisionRidePalette> = {
  starCore: GOLF_PALETTE.starCore,
  starHero: GOLF_PALETTE.starHero,
  sunTop: GOLF_PALETTE.sunTop,
  sunMiddle: GOLF_PALETTE.sunMiddle,
  sunFoot: GOLF_PALETTE.sunFoot,
  sunGrooveTop: GOLF_PALETTE.sunGrooveTop,
  sunGrooveBottom: GOLF_PALETTE.sunGrooveBottom,
  sunBevel: GOLF_PALETTE.sunBevel,
  surfaceBase: GOLF_PALETTE.surfaceBase,
  surfaceBottom: GOLF_PALETTE.surfaceBottom,
  roadLine: GOLF_PALETTE.roadLine,
};

/** Resolve one ride from the independent modifiers the visitor armed in the
 * room. Colour, pace and finish stay separate, so discoveries compose instead
 * of selecting one mutually exclusive skin. */
export function resolveVisionRideProfile(
  session: VisionRideSessionProfile,
): VisionRideProfile {
  const palette: VisionRidePalette = {
    ...(session.night
      ? NIGHT_PALETTE
      : session.redline
        ? REDLINE_PALETTE
        : session.golf
          ? GOLF_PALETTE
          : VISION_RIDE_PALETTE),
    ...(session.night && session.redline ? REDLINE_ACCENTS : null),
    ...((session.night || session.redline) && session.golf
      ? GOLF_ACCENTS
      : null),
  };

  return {
    palette,
    speedMetresPerSecond: session.redline ? 18 : session.golf ? 9 : 12,
    starCountScale: session.night
      ? session.redline
        ? 1.15
        : 1.8
      : session.redline
        ? 0.45
        : session.golf
          ? 0.15
          : 1,
    sunBaseScale: session.golf
      ? 1.28
      : session.redline
        ? 0.7
        : session.night
          ? 0.62
          : 1,
    breath: session.redline
      ? { halfCycleSeconds: 15, sunGrowth: 0.68, carGrowth: 1.5 }
      : session.golf
        ? { halfCycleSeconds: 40, sunGrowth: 0.3, carGrowth: 0.72 }
        : { halfCycleSeconds: 30, sunGrowth: 0.5, carGrowth: 1.25 },
    parallaxScale: session.redline ? 1.2 : session.golf ? 0.82 : 1,
    terrain: session.golf
      ? {
          heightScale: 0.58,
          gridCellXScale: 2.2,
          gridCellYScale: 0.9,
          lineWidthPx: 1.35,
          lineOpacity: 0.68,
        }
      : session.redline
        ? {
            heightScale: 1.38,
            gridCellXScale: 0.65,
            gridCellYScale: 1.8,
            lineWidthPx: 2.15,
            lineOpacity: 1,
          }
        : session.night
          ? {
              heightScale: 0.78,
              gridCellXScale: 1.45,
              gridCellYScale: 1.45,
              lineWidthPx: 1.15,
              lineOpacity: 0.45,
            }
          : {
              heightScale: 1,
              gridCellXScale: 1,
              gridCellYScale: 1,
              lineWidthPx: 1.7,
              lineOpacity: 0.9,
            },
    sunStyle: session.golf
      ? { bandCount: 6, bandSpeed: 0.06, grooveMin: 0.04, grooveMax: 0.1 }
      : session.redline
        ? {
            bandCount: 30,
            bandSpeed: 1.1,
            grooveMin: 0.045,
            grooveMax: 0.28,
          }
        : session.night
          ? {
              bandCount: 9,
              bandSpeed: 0.1,
              grooveMin: 0.04,
              grooveMax: 0.12,
            }
          : {
              bandCount: 18,
              bandSpeed: 0.32,
              grooveMin: 0.055,
              grooveMax: 0.2,
            },
    hemisphere: session.golf
      ? { sky: "#b9e8d3", ground: "#123b20", intensity: 1.65 }
      : session.redline
        ? { sky: "#ff7a35", ground: "#210000", intensity: 1.7 }
        : session.night
          ? { sky: "#5cbcff", ground: "#020824", intensity: 1.35 }
          : { sky: "#b9c7ff", ground: "#3a004d", intensity: 1.5 },
    directional: session.golf
      ? { color: "#d6ff8a", intensity: 3.5 }
      : session.redline
        ? { color: "#ff3b12", intensity: 4.2 }
        : session.night
          ? { color: "#68d8ff", intensity: 2.8 }
          : { color: "#ff9a63", intensity: 3.2 },
    point: session.golf
      ? { color: "#39e56f", intensity: 20 }
      : session.redline
        ? { color: "#ff1808", intensity: 23 }
        : session.night
          ? { color: "#18c8ff", intensity: 20 }
          : { color: "#ff2b9f", intensity: 18 },
    car: session.golf
      ? {
          body: "#0f6b32",
          glass: "#071b10",
          wheel: "#071008",
          weaveRate: 0.16,
          weaveAmount: 0.1,
          bounceRate: 1.1,
          bounceAmount: 0.01,
          rollRate: 0.25,
          rollAmount: 0.003,
        }
      : session.redline
        ? {
            body: "#ff1808",
            glass: "#170100",
            wheel: "#100000",
            weaveRate: 0.8,
            weaveAmount: 0.32,
            bounceRate: 5.2,
            bounceAmount: 0.035,
            rollRate: 1.4,
            rollAmount: 0.012,
          }
        : session.night
          ? {
              body: "#2446ff",
              glass: "#020719",
              wheel: "#050610",
              weaveRate: 0.24,
              weaveAmount: 0.12,
              bounceRate: 1.6,
              bounceAmount: 0.012,
              rollRate: 0.35,
              rollAmount: 0.004,
            }
          : {
              body: "#ffffff",
              glass: "#071330",
              wheel: "#10071c",
              weaveRate: 0.42,
              weaveAmount: 0.22,
              bounceRate: 3.1,
              bounceAmount: 0.025,
              rollRate: 0.83,
              rollAmount: 0.008,
            },
  };
}

export function visionRideFullStack(session: VisionRideSessionProfile) {
  return (
    session.night &&
    session.redline &&
    session.golf &&
    session.pixelLook !== "off"
  );
}
