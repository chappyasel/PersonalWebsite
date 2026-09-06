"use client";

// What the room does to a photograph, measured on the print itself.
//
// The preview shows a file; the shelf shows that file lit by the rig and run
// through ACES. Bridging the two used to be one multiply constant per theme,
// and measurement killed that idea: on the SAME About shelf in light mode the
// profile frame renders BRIGHTER than its file (x1.01/1.07/1.08) while the
// portrait renders much darker (x0.75/0.74/0.79), and the flat arch print
// comes out warm with its blue cut a quarter (x1.03/0.86/0.75). No single
// colour is even the right DIRECTION for all three, and a multiply blend
// cannot brighten at all.
//
// So the shade is measured per print, at the moment of the click, by
// rendering the scene once more into a tiny target framed on that print's
// own pixels and comparing it with the decoded file. Everything that makes
// prints differ — lamp proximity, grazing angle, theme exposure, the pose
// the hover left it in — is in the sample rather than in a table someone has
// to keep up to date.
//
// A probe render is not the frame the visitor sees, though: the composer owns
// tone mapping and the grade, so a raw probe reads both cooler and much
// flatter than the real thing (measured: half the chroma). Rather than
// compare against the wrong picture, the readback is pushed through the same
// display chain on the CPU — exposure and ACES, then the grade in
// `Effects.tsx` — before anything is concluded from it. That port is the
// fragile part of this module: if GRADE_FRAGMENT changes, `gradeDisplay`
// below has to change with it, and `artifactShadeProbe.test.ts` pins the two
// together. The probe frames a photograph, and the grade leaves a
// photograph's chroma at the file's own (ADR 0023), so the port replays it
// that way.
//
// Still not covered: vignette, bloom, DoF, AO. Those depend on where the
// print sits in frame or on its neighbours, not on the print, and they are
// small next to the error this removes.
import * as THREE from "three";

import type { ArtifactShadeSample } from "./artifactShadeSamples";
import { PHOTOGRAPH_SATURATION } from "./photoMaskLayer";
import {
  type SceneColorGradeThemeSettings,
  sceneColorGradeController,
  sceneColorGradeFor,
} from "./sceneColorGrade";
import {
  DEVELOP_IDENTITY,
  type SceneDevelopSettings,
  developDisplay,
  sceneGradeLookFor,
  sceneGradeProfileController,
} from "./sceneGradeProfiles";
import { sceneQualityController } from "./sceneQualityController";

const PROBE_SIZE = 64;
/** Fraction of the print's projected box the probe frames. Trimming the
 * outer third keeps the mat, the frame, and the shelf behind it out of a
 * sample that is meant to describe the PHOTO. */
const PROBE_INSET = 0.32;
const PROBE_SPAN = 1 - PROBE_INSET * 2;

/** Guard rails. A sample outside these is not a lighting difference, it is a
 * bad measurement — the print half-occluded, the probe framing empty shelf —
 * and the caller falls back to the per-theme constant. */
const BRIGHTNESS_RANGE: readonly [number, number] = [0.45, 1.8];
const TINT_FLOOR = 0.5;

// --- the display chain, ported from the shaders it has to agree with ------

function srgbToLinear(value: number) {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number) {
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function rrtAndOdtFit(v: number) {
  const a = v * (v + 0.0245786) - 0.000090537;
  const b = v * (0.983729 * v + 0.432951) + 0.238081;
  return a / b;
}

/** three's ACESFilmicToneMapping, which the composer's ToneMapping effect
 * runs in ACES_FILMIC mode. The matrices are the GLSL ones transposed back
 * out of column-major order. */
function acesFilmic(
  rgb: [number, number, number],
  exposure: number,
): [number, number, number] {
  const scale = exposure / 0.6;
  const r = rgb[0] * scale;
  const g = rgb[1] * scale;
  const b = rgb[2] * scale;
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const fr = rrtAndOdtFit(ir);
  const fg = rrtAndOdtFit(ig);
  const fb = rrtAndOdtFit(ib);
  const or_ = 1.60475 * fr - 0.53108 * fg - 0.07367 * fb;
  const og = -0.10208 * fr + 1.10813 * fg - 0.00605 * fb;
  const ob = -0.00327 * fr - 0.07276 * fg + 1.07602 * fb;
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  return [clamp01(or_), clamp01(og), clamp01(ob)];
}

const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

function luma(rgb: readonly [number, number, number]) {
  return rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
}

/** GRADE_FRAGMENT from `Effects.tsx`, in display space. Kept in the same
 * order as the shader — curve, toe tint, key hue, chroma rebuild — so the two
 * can be read side by side. `photograph` is the mask: where it is set the
 * shader blends the chroma multiplier back to the file's own. */
export function gradeDisplay(
  display: [number, number, number],
  settings: SceneColorGradeThemeSettings,
  dark: number,
  photograph = false,
): [number, number, number] {
  let d: [number, number, number] = [...display];

  d = d.map((c) => c + (c * c * (3 - 2 * c) - c) * settings.curve) as [
    number,
    number,
    number,
  ];

  let l = luma(d);
  const toe = 8 * l * Math.max(0, 1 - 2 * l);
  const toeHue: [number, number, number] = [
    1.0 + (0.5 - 1.0) * dark,
    0.82 + (0.66 - 0.82) * dark,
    0.6 + (1.0 - 0.6) * dark,
  ];
  d = d.map((c, i) => c + toeHue[i]! * toe * settings.toeTint) as [
    number,
    number,
    number,
  ];

  l = luma(d);
  const keyHue: [number, number, number] = [
    1.012 + (1.016 - 1.012) * dark,
    1.0 + (0.998 - 1.0) * dark,
    0.978 + (0.968 - 0.978) * dark,
  ];
  const keyMix = smoothstep(0.4, 0.95, l);
  d = d.map((c, i) => c * (1 + (keyHue[i]! - 1) * keyMix)) as [
    number,
    number,
    number,
  ];

  l = luma(d);
  const band = smoothstep(0.3, 0.7, l) * (1 - smoothstep(0.84, 1.0, l));
  const saturation = photograph
    ? PHOTOGRAPH_SATURATION
    : 1.05 + settings.chromaBoost * band;
  return d.map((c) => Math.max(0, l + (c - l) * saturation)) as [
    number,
    number,
    number,
  ];
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The probe's raw sRGB readback, taken to the pixel the compositor would
 * have shown. */
function toDisplayed(
  srgb: [number, number, number],
  exposure: number,
  settings: SceneColorGradeThemeSettings,
  dark: number,
  develop: SceneDevelopSettings = DEVELOP_IDENTITY,
): [number, number, number] {
  const linear = srgb.map(srgbToLinear) as [number, number, number];
  const tonemapped = acesFilmic(linear, exposure);
  // The shader steps into an approximate display space with pow(1/2.2) and
  // back out with pow(2.2); the final encode to sRGB then follows.
  const display = tonemapped.map((c) => Math.pow(Math.max(0, c), 1 / 2.2)) as [
    number,
    number,
    number,
  ];
  // The probe frames a print, which the mask hands to the grade as a
  // photograph. The develop stage of the active grade profile follows the
  // print grade, as in the shader; the probe reads the middle of a print,
  // where the post vignette is zero, so no frame position is passed.
  const graded = developDisplay(
    gradeDisplay(display, settings, dark, true),
    develop,
  );
  return graded.map((c) => linearToSrgb(Math.pow(Math.max(0, c), 2.2))) as [
    number,
    number,
    number,
  ];
}

let probeTarget: THREE.WebGLRenderTarget | null = null;
const probeBuffer = new Uint8Array(PROBE_SIZE * PROBE_SIZE * 4);
let sourceCanvas: HTMLCanvasElement | null = null;

type ChannelStats = { r: number; g: number; b: number };

/** Mean channel values over an RGBA buffer. Both sides of the comparison are
 * sampled in the same sRGB byte space, which is the space the CSS correction
 * acts in. */
function channelStats(
  data: Uint8Array | Uint8ClampedArray,
  stride = 4,
  transform?: (rgb: [number, number, number]) => [number, number, number],
): ChannelStats | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index + 2 < data.length; index += stride) {
    // A fully transparent pixel is the clear colour showing through, not the
    // print. Weighing those in would drag every sample toward the sky.
    if (stride === 4 && data[index + 3]! < 8) continue;
    const pixel: [number, number, number] = [
      data[index]! / 255,
      data[index + 1]! / 255,
      data[index + 2]! / 255,
    ];
    const [pr, pg, pb] = transform ? transform(pixel) : pixel;
    r += pr;
    g += pg;
    b += pb;
    count += 1;
  }
  if (count === 0) return null;
  return { r: r / count, g: g / count, b: b / count };
}

/** The same central crop of the decoded file the probe framed on screen,
 * with the texture's own cover transform applied so a cropped print is
 * compared against the part of the file it actually shows. */
function sourceStats(texture: THREE.Texture): ChannelStats | null {
  const image = texture.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!image || !width || !height) return null;
  if (!sourceCanvas) {
    sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = PROBE_SIZE;
    sourceCanvas.height = PROBE_SIZE;
  }
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  // Texture space is y-up from the bottom left; canvas space is y-down from
  // the top left, so the v window flips.
  const repeatX = texture.repeat.x || 1;
  const repeatY = texture.repeat.y || 1;
  const left = (texture.offset.x + repeatX * PROBE_INSET) * width;
  const cropWidth = repeatX * PROBE_SPAN * width;
  const topV = texture.offset.y + repeatY * (1 - PROBE_INSET);
  const top = (1 - topV) * height;
  const cropHeight = repeatY * PROBE_SPAN * height;
  if (cropWidth <= 0 || cropHeight <= 0) return null;
  context.clearRect(0, 0, PROBE_SIZE, PROBE_SIZE);
  try {
    context.drawImage(
      image as CanvasImageSource,
      Math.max(0, left),
      Math.max(0, top),
      Math.min(cropWidth, width),
      Math.min(cropHeight, height),
      0,
      0,
      PROBE_SIZE,
      PROBE_SIZE,
    );
    return channelStats(
      context.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data,
    );
  } catch {
    // A cross-origin texture taints the canvas. Remote covers reach the
    // scene through the same-origin image proxy, so this is a guard rather
    // than an expected path.
    return null;
  }
}

/** The largest textured plane under `root` — the print's photo — and the
 * texture it samples. */
function printTexture(root: THREE.Object3D): THREE.Texture | null {
  let best: THREE.Texture | null = null;
  let bestArea = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.geometry || !node.visible) return;
    const material = mesh.material as THREE.MeshStandardMaterial | undefined;
    const map = material?.map;
    if (!map?.image) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box || box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const spans = [size.x, size.y, size.z].sort((a, b) => a - b);
    const area = spans[1]! * spans[2]!;
    if (area <= bestArea) return;
    best = map;
    bestArea = area;
  });
  return best;
}

export type ArtifactShadeProbeRequest = {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  root: THREE.Object3D;
  /** The print's projected box in CSS pixels, and the canvas it sits in. */
  rect: { left: number; top: number; width: number; height: number };
  viewport: { left: number; top: number; width: number; height: number };
};

/** Render the print once into a small target and report how the room changed
 * it. Returns null whenever the measurement cannot be trusted; the caller
 * then keeps the per-theme constant. */
export function probeArtifactShade({
  gl,
  scene,
  camera,
  root,
  rect,
  viewport,
}: ArtifactShadeProbeRequest): ArtifactShadeSample | null {
  if (!camera.isPerspectiveCamera) return null;
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  if (rect.width <= 4 || rect.height <= 4) return null;
  const texture = printTexture(root);
  if (!texture) return null;
  const source = sourceStats(texture);
  if (!source || source.r + source.g + source.b < 0.02) return null;

  if (!probeTarget) {
    probeTarget = new THREE.WebGLRenderTarget(PROBE_SIZE, PROBE_SIZE);
    // Read back in the same encoding the canvas presents, so the numbers can
    // be compared with the decoded file directly.
    probeTarget.texture.colorSpace = THREE.SRGBColorSpace;
    probeTarget.texture.generateMipmaps = false;
    probeTarget.texture.minFilter = THREE.LinearFilter;
  }

  const previousTarget = gl.getRenderTarget();
  const previousView =
    camera.view?.enabled === true ? { ...camera.view } : null;
  // The composer leaves autoClear off. Without restoring it the probe target
  // keeps the DEPTH buffer from the previous probe, every later render is
  // rejected by the depth test, and each print silently inherits the first
  // one's pixels — measured: three different prints, one byte-identical
  // sample.
  const previousAutoClear = gl.autoClear;
  let rendered: ChannelStats | null = null;
  try {
    // The live camera rather than a clone: it already carries the rig's world
    // matrix, and a mid-frame view offset is invisible as long as it is
    // always cleared. Framing the print's central region means the probe
    // reads the photo at full target resolution instead of a few pixels of a
    // full-frame render.
    camera.setViewOffset(
      viewport.width,
      viewport.height,
      rect.left - viewport.left + rect.width * PROBE_INSET,
      rect.top - viewport.top + rect.height * PROBE_INSET,
      rect.width * PROBE_SPAN,
      rect.height * PROBE_SPAN,
    );
    gl.setRenderTarget(probeTarget);
    gl.autoClear = true;
    gl.clear(true, true, true);
    gl.render(scene, camera);
    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      PROBE_SIZE,
      PROBE_SIZE,
      probeBuffer,
    );
    const quality = sceneQualityController.getSnapshot();
    const look = sceneGradeLookFor(
      sceneGradeProfileController.getSnapshot(),
      sceneColorGradeFor(
        sceneColorGradeController.getSnapshot(),
        quality.cinematicPlus,
      ),
    );
    const dark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
        ? 1
        : 0;
    const settings = dark ? look.base.dark : look.base.light;
    const develop = dark ? look.develop.dark : look.develop.light;
    const exposure = gl.toneMappingExposure || settings.exposure;
    rendered = channelStats(probeBuffer, 4, (pixel) =>
      toDisplayed(pixel, exposure, settings, dark, develop),
    );
  } catch {
    return null;
  } finally {
    gl.autoClear = previousAutoClear;
    gl.setRenderTarget(previousTarget);
    if (previousView)
      camera.setViewOffset(
        previousView.fullWidth,
        previousView.fullHeight,
        previousView.offsetX,
        previousView.offsetY,
        previousView.width,
        previousView.height,
      );
    else camera.clearViewOffset();
  }
  if (!rendered) return null;

  return artifactShadeSample(rendered, source);
}

/** The factoring, kept separate from the GL work so it can be tested: a
 * scalar brightness that may exceed 1, a tint whose brightest channel is
 * exactly 1 (so a multiply blend can carry the remaining colour cast), and a
 * saturation factor. */
export function artifactShadeSample(
  rendered: ChannelStats,
  source: ChannelStats,
): ArtifactShadeSample | null {
  const ratio = [
    source.r > 0.004 ? rendered.r / source.r : 1,
    source.g > 0.004 ? rendered.g / source.g : 1,
    source.b > 0.004 ? rendered.b / source.b : 1,
  ] as const;
  if (!ratio.every((value) => Number.isFinite(value) && value > 0)) return null;
  const brightness = Math.max(...ratio);
  if (
    brightness < BRIGHTNESS_RANGE[0] ||
    brightness > BRIGHTNESS_RANGE[1] ||
    Math.min(...ratio) / brightness < TINT_FLOOR
  )
    return null;
  return {
    brightness,
    tint: [
      ratio[0] / brightness,
      ratio[1] / brightness,
      ratio[2] / brightness,
    ] as const,
  };
}

/** The tint as a CSS colour for the multiply layer. */
export function artifactShadeTintColor(sample: ArtifactShadeSample): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgb(${channel(sample.tint[0])}, ${channel(sample.tint[1])}, ${channel(sample.tint[2])})`;
}
