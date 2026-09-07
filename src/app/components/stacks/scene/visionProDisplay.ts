import * as THREE from "three";

export type VisionProDisplayVariant =
  | "dormant"
  | "retrowave"
  | "3:45"
  | "redline"
  | "golf";

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

/** A diffused light field beneath the front glass. Two wide Gaussian lobes
 * blend through the bridge, then a much softer visor contour keeps their
 * faint tails off the source model's rectangular display strip. This avoids
 * a readable mask edge: the artwork dissolves through the smoked laminate
 * before it reaches the crown, temples, or nose relief. */
export function visionProDisplayCoverage(u: number, v: number) {
  const lobe = (centerX: number) =>
    Math.exp(
      -Math.pow((u - centerX) / 0.24, 2) - Math.pow((v - 0.56) / 0.3, 2),
    );
  const leftLobe = lobe(0.31);
  const rightLobe = lobe(0.69);
  const blendedLobes = 1 - (1 - leftLobe) * (1 - rightLobe);
  const lightField = clamp01((blendedLobes - 0.04) / 0.8);

  const horizontal = Math.abs((u - 0.5) / 0.51);
  const templeRoll = horizontal ** 8;
  const topBoundary = 0.95 - 0.03 * horizontal * horizontal - 0.13 * templeRoll;
  const noseRelief = 0.38 * Math.exp(-Math.pow((u - 0.5) / 0.115, 2));
  const bottomBoundary =
    0.04 + 0.02 * horizontal * horizontal + 0.22 * templeRoll + noseRelief;

  const edgeFeather = 0.16;
  const templeCoverage = 1 - smoothstep(0.78, 1, horizontal);
  const topCoverage = 1 - smoothstep(topBoundary - edgeFeather, topBoundary, v);
  const bottomCoverage = smoothstep(
    bottomBoundary,
    bottomBoundary + edgeFeather,
    v,
  );
  return clamp01(lightField * templeCoverage * topCoverage * bottomCoverage);
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
  return [...retrowaveColor(u, v, variant), alpha];
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
  texture.name = `vision-pro-display-${variant}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}
