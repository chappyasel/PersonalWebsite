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
  carMotionScale: number;
  hemisphere: Readonly<{
    sky: string;
    ground: string;
    intensity: number;
  }>;
  directional: Readonly<{ color: string; intensity: number }>;
  point: Readonly<{ color: string; intensity: number }>;
}>;

const NIGHT_SKY: Pick<
  VisionRidePalette,
  | "skyTop"
  | "skyUpper"
  | "skyViolet"
  | "skyMagenta"
  | "skyPink"
  | "skyHorizon"
  | "skyHorizonCrest"
> = {
  skyTop: [0.0005, 0.003, 0.018],
  skyUpper: [0.006, 0.025, 0.085],
  skyViolet: [0.025, 0.075, 0.19],
  skyMagenta: [0.09, 0.13, 0.32],
  skyPink: [0.08, 0.22, 0.4],
  skyHorizon: [0.09, 0.42, 0.46],
  skyHorizonCrest: [0.16, 0.58, 0.5],
};

const GOLF_GROUND: Pick<
  VisionRidePalette,
  "surfaceBase" | "surfaceBottom" | "roadLine"
> = {
  surfaceBase: [0.008, 0.05, 0.018],
  surfaceBottom: [0.025, 0.15, 0.04],
  roadLine: [0.48, 1, 0.22],
};

/** Resolve one ride from the independent modifiers the visitor armed in the
 * room. Colour, pace and finish stay separate, so discoveries compose instead
 * of selecting one mutually exclusive skin. */
export function resolveVisionRideProfile(
  session: VisionRideSessionProfile,
): VisionRideProfile {
  const palette: VisionRidePalette = {
    ...VISION_RIDE_PALETTE,
    ...(session.night ? NIGHT_SKY : null),
    ...(session.golf ? GOLF_GROUND : null),
    ...(session.golf
      ? {
          sunTop: [0.72, 1, 0.18] as const,
          sunMiddle: [0.32, 0.82, 0.16] as const,
          sunFoot: [0.06, 0.38, 0.12] as const,
        }
      : null),
  };

  return {
    palette,
    speedMetresPerSecond: session.redline ? 18 : session.golf ? 9 : 12,
    starCountScale: session.night ? 1.35 : session.golf ? 0.72 : 1,
    sunBaseScale: session.golf ? 0.82 : 1,
    breath: session.redline
      ? { halfCycleSeconds: 15, sunGrowth: 0.68, carGrowth: 1.5 }
      : session.golf
        ? { halfCycleSeconds: 40, sunGrowth: 0.3, carGrowth: 0.72 }
        : { halfCycleSeconds: 30, sunGrowth: 0.5, carGrowth: 1.25 },
    parallaxScale: session.redline ? 1.2 : session.golf ? 0.82 : 1,
    carMotionScale: session.redline ? 1.35 : session.golf ? 0.72 : 1,
    hemisphere: session.golf
      ? { sky: "#b9e8d3", ground: "#123b20", intensity: 1.65 }
      : { sky: "#b9c7ff", ground: "#3a004d", intensity: 1.5 },
    directional: session.golf
      ? { color: "#d6ff8a", intensity: 3.5 }
      : { color: "#ff9a63", intensity: 3.2 },
    point: session.golf
      ? { color: "#39e56f", intensity: 20 }
      : { color: "#ff2b9f", intensity: 18 },
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
