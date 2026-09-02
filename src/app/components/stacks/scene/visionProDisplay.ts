import * as THREE from "three";

import { DB32_PALETTE } from "./pixelArt";

export type VisionProDisplayVariant =
  | "dormant"
  | "retrowave"
  | "3:45"
  | "redline"
  | "golf"
  | "8-bit"
  | "16-bit";

export type ActiveVisionProDisplayVariant = Exclude<
  VisionProDisplayVariant,
  "dormant"
>;

export const VISION_PRO_DISPLAY_TEXTURE_WIDTH = 128;
export const VISION_PRO_DISPLAY_TEXTURE_HEIGHT = 64;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

/** The soft two-lobed shape visible beneath the headset's smoked visor. */
export function visionProDisplayCoverage(u: number, v: number) {
  const leftEllipse = ((u - 0.34) / 0.31) ** 2 + ((v - 0.53) / 0.39) ** 2;
  const rightEllipse = ((u - 0.66) / 0.31) ** 2 + ((v - 0.53) / 0.39) ** 2;
  const outerCoverage =
    1 - smoothstep(0.9, 1, Math.min(leftEllipse, rightEllipse));
  const noseBoundary = 0.12 + 0.34 * Math.exp(-Math.pow((u - 0.5) / 0.105, 2));
  const noseCoverage = smoothstep(noseBoundary, noseBoundary + 0.035, v);
  return clamp01(outerCoverage * noseCoverage);
}

function hash2(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43_758.5453;
  return value - Math.floor(value);
}

function retrowaveColor(
  u: number,
  v: number,
  variant: ActiveVisionProDisplayVariant = "retrowave",
): readonly [number, number, number] {
  const horizon = 0.38;
  const vertical = smoothstep(0.14, 0.96, v);
  const side = smoothstep(0.04, 0.96, u);
  const colors =
    variant === "3:45"
      ? {
          lowerLeft: [30, 129, 170],
          lowerRight: [37, 58, 151],
          upperLeft: [5, 18, 62],
          upperRight: [1, 7, 35],
        }
      : variant === "golf"
        ? {
            lowerLeft: [96, 232, 75],
            lowerRight: [17, 129, 57],
            upperLeft: [32, 119, 119],
            upperRight: [9, 45, 72],
          }
        : variant === "redline"
          ? {
              lowerLeft: [255, 64, 34],
              lowerRight: [244, 0, 117],
              upperLeft: [148, 0, 68],
              upperRight: [45, 0, 53],
            }
          : {
              lowerLeft: [244, 48, 128],
              lowerRight: [91, 45, 218],
              upperLeft: [76, 31, 134],
              upperRight: [35, 38, 133],
            };
  const { lowerLeft, lowerRight, upperLeft, upperRight } = colors;
  const upper = upperLeft.map((channel, index) =>
    mix(channel, upperRight[index]!, side),
  );
  const lower = lowerLeft.map((channel, index) =>
    mix(channel, lowerRight[index]!, side),
  );
  let color = lower.map((channel, index) =>
    mix(channel, upper[index]!, vertical),
  ) as [number, number, number];

  const sunX = (u - 0.5) / 0.18;
  const sunY = (v - 0.57) / 0.21;
  const inSun = sunX * sunX + sunY * sunY < 1;
  const sunBand = Math.floor((v - 0.39) * 54);
  if (inSun && (v > 0.57 || sunBand % 2 === 0)) {
    const sunHeight = smoothstep(0.39, 0.76, v);
    color =
      variant === "golf"
        ? [mix(175, 242, sunHeight), 255, mix(74, 154, sunHeight)]
        : variant === "3:45"
          ? [mix(112, 184, sunHeight), mix(180, 236, sunHeight), 255]
          : [255, mix(103, 219, sunHeight), mix(105, 104, sunHeight)];
  }

  if (v > 0.67) {
    const starCellX = Math.floor(u * 59);
    const starCellY = Math.floor(v * 31);
    const star = hash2(starCellX, starCellY);
    if (star > 0.965) color = star > 0.988 ? [238, 247, 255] : [142, 205, 255];
  }

  if (v < horizon) {
    const depth = clamp01((horizon - v) / horizon);
    color =
      variant === "golf"
        ? [mix(19, 4, depth), mix(102, 38, depth), mix(42, 19, depth)]
        : variant === "3:45"
          ? [mix(16, 3, depth), mix(42, 14, depth), mix(91, 57, depth)]
          : [mix(71, 15, depth), mix(30, 13, depth), mix(105, 63, depth)];
    const perspective = Math.abs(u - 0.5) / Math.max(0.025, depth);
    const spoke = Math.abs(perspective * 7 - Math.round(perspective * 7));
    const row = Math.abs(depth * depth * 23 - Math.round(depth * depth * 23));
    if (spoke < 0.055 || row < 0.045)
      color =
        variant === "golf"
          ? [120, 255, 88]
          : variant === "3:45"
            ? [57, 164, 236]
            : variant === "redline"
              ? [255, 52, 29]
              : [205, 45, 176];
  }

  return color.map((channel) => Math.round(channel)) as [
    number,
    number,
    number,
  ];
}

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

function quantize8Bit(
  color: readonly [number, number, number],
  blockX: number,
  blockY: number,
): readonly [number, number, number] {
  const threshold =
    (BAYER_4[(blockY % 4) * 4 + (blockX % 4)]! / 15 - 0.5) * 0.6;
  return color.map((channel) => {
    const value = clamp01(channel / 255 + threshold / 7);
    return Math.round((Math.round(value * 7) / 7) * 255);
  }) as [number, number, number];
}

function nearestDb32(
  color: readonly [number, number, number],
): readonly [number, number, number] {
  let nearest = DB32_PALETTE[0]!;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of DB32_PALETTE) {
    const red = color[0] / 255 - candidate[0];
    const green = color[1] / 255 - candidate[1];
    const blue = color[2] / 255 - candidate[2];
    const distance = red * red + green * green + blue * blue;
    if (distance >= nearestDistance) continue;
    nearest = candidate;
    nearestDistance = distance;
  }
  return nearest.map((channel) => Math.round(channel * 255)) as [
    number,
    number,
    number,
  ];
}

function snap(value: number, cells: number) {
  return (
    (Math.min(cells - 1, Math.floor(clamp01(value) * cells)) + 0.5) / cells
  );
}

/** Sample one variant. Coordinates follow the texture convention, with
 * (0, 0) at the lower-left corner. Dormant returns a transparent pixel so
 * callers can resolve variants without a separate sentinel color. */
export function visionProDisplayPixel(
  u: number,
  v: number,
  variant: VisionProDisplayVariant = "retrowave",
): readonly [number, number, number, number] {
  if (variant === "dormant") return [0, 0, 0, 0];

  const alpha = Math.round(visionProDisplayCoverage(u, v) * 255);
  if (!["8-bit", "16-bit"].includes(variant))
    return [...retrowaveColor(u, v, variant), alpha];

  const cellsX = variant === "8-bit" ? 32 : 64;
  const cellsY = variant === "8-bit" ? 16 : 32;
  const blockX = Math.min(cellsX - 1, Math.floor(clamp01(u) * cellsX));
  const blockY = Math.min(cellsY - 1, Math.floor(clamp01(v) * cellsY));
  const source = retrowaveColor(snap(u, cellsX), snap(v, cellsY));
  const color =
    variant === "8-bit"
      ? quantize8Bit(source, blockX, blockY)
      : nearestDb32(source);
  return [...color, alpha];
}

export function createVisionProDisplayTexture(
  variant: ActiveVisionProDisplayVariant = "retrowave",
) {
  const data = new Uint8Array(
    VISION_PRO_DISPLAY_TEXTURE_WIDTH * VISION_PRO_DISPLAY_TEXTURE_HEIGHT * 4,
  );
  for (let y = 0; y < VISION_PRO_DISPLAY_TEXTURE_HEIGHT; y += 1) {
    for (let x = 0; x < VISION_PRO_DISPLAY_TEXTURE_WIDTH; x += 1) {
      const pixel = visionProDisplayPixel(
        x / (VISION_PRO_DISPLAY_TEXTURE_WIDTH - 1),
        y / (VISION_PRO_DISPLAY_TEXTURE_HEIGHT - 1),
        variant,
      );
      data.set(pixel, (y * VISION_PRO_DISPLAY_TEXTURE_WIDTH + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(
    data,
    VISION_PRO_DISPLAY_TEXTURE_WIDTH,
    VISION_PRO_DISPLAY_TEXTURE_HEIGHT,
    THREE.RGBAFormat,
  );
  const pixelated = variant === "8-bit" || variant === "16-bit";
  texture.name = `vision-pro-display-${variant}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
  texture.minFilter = pixelated
    ? THREE.NearestFilter
    : THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = !pixelated;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}
