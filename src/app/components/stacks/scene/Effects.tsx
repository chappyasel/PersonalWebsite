"use client";

// Shared postprocessing chain (audit §2.1, verified against installed source).
// Ground rules that keep this correct:
// - NEVER pass enabled={false}: a mounted-disabled composer pins the
//   renderer to NoToneMapping and blows out the frame. StacksCanvas mounts
//   and unmounts this component instead, in lockstep with the dpr ladder
//   (N8AO × adaptive-dpr is a known-bad pair).
// - multisampling={0}: SMAA owns the composer's offscreen target; the base
//   canvas still requests hardware MSAA so the performance ladder retains an
//   antialiasing floor when it unmounts this composer. MSAA render targets
//   corrupt on iOS, so touch and desktop both keep the composer target at 0.
// - ToneMapping mode is ACES explicitly — the effect DEFAULTS TO AGX, and
//   the mode enum must come from `postprocessing` (not re-exported).
//   Exposure parity with the composer-off path is automatic: three binds
//   renderer.toneMappingExposure into any program that declares it.
import { useStacks } from "../store";
import {
  useVisionRidePreviewOverrides,
  useVisionRideRetroFxEnabled,
} from "../visionRide/visionRideDiagnostics";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  EffectComposerContext,
  GodRays,
  N8AO,
  SMAA,
  TiltShift2,
  ToneMapping,
  Vignette,
  useDispose,
} from "@react-three/postprocessing";
import {
  BlendFunction,
  type DepthOfFieldEffect,
  Effect,
  EffectAttribute,
  ToneMappingMode,
} from "postprocessing";
import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Uniform, Vector2, Vector3, Vector4 } from "three";

import {
  OPTICAL_BOKEH_MATCHED_TAPS,
  OPTICAL_BOKEH_QUALITY_TAPS,
  OPTICAL_BOKEH_ULTRA_TAPS,
  OpticalBokehPrototype,
} from "./OpticalBokehPrototype";
import { PhotoMaskPass } from "./PhotoMaskPass";
import { useCinematicSun } from "./cinematicSun";
import { focusPull, focusPullTarget } from "./focusPull";
import {
  captureLensCenterFromSearch,
  effectiveCaptureLensCenter,
  sideLensPlan,
} from "./lensGeometry";
import { usePhotographTreatment } from "./photographTreatment";
import {
  DB32_PALETTE,
  PIXEL_WIPE_SECONDS,
  type PixelArtPlan,
  type PixelLook,
  paletteGlsl,
  pixelArtBlockPixels,
  pixelArtPlanFor,
  pixelWipeCoverRadius,
} from "./pixelArt";
import { type SceneQualityPlan, tiltShiftEnabled } from "./quality";
import {
  type SceneColorGradeSettings,
  sceneColorGradeFor,
  useSceneColorGradeSettings,
} from "./sceneColorGrade";
import {
  HUE_BANDS,
  HUE_BAND_CENTERS,
  type SceneDevelopByTheme,
  type SceneDevelopSettings,
  developIsIdentity,
  mixerIsIdentity,
  sceneGradeLookFor,
  useSceneGradeProfile,
} from "./sceneGradeProfiles";
import { useScenePerformanceSettings } from "./scenePerformance";
import { useSceneQualityControls } from "./sceneQualityController";
import { useScreenshotMode } from "./screenshotMode";
import {
  type ShelfDepthOfFieldTuning,
  applyShelfDepthOfFieldTuning,
  resolveShelfDepthOfFieldTuning,
} from "./shelfDepthOfField";

// The print grade — the last thing between ACES and the screen, and the
// reason the room reads as one photograph rather than 37 correctly-lit
// materials. Three jobs, in the order a colourist would do them:
//
//  1. A filmic S about mid grey. One smoothstep is a toe and a shoulder at
//     once, so highlights roll off instead of clipping flat.
//  2. Split tone. The toe takes the AMBIENT hue and the highlights take the
//     KEY, which is just what the scene already is: dawn bounce over a low
//     sun in light; the cold indigo 3:45 sky over a tungsten desk lamp in
//     dark. The toe is shaped to peak in the low-mids and return to zero at
//     true black, so the deep end tints without milking, and to zero above
//     mid, so the sky is left alone.
//  3. Chroma rebuild. ACES desaturates hardest in the upper mids — measured
//     on this scene it flattens the sky's chroma about 3:1, which is why the
//     light sky printed as neutral grey at every hex we tried. This puts
//     that chroma back where it was taken and nowhere else: band-limited so
//     near-whites stay white and cover art keeps its ACES ceiling.
//     Photographs sit this step out (ADR 0023): they are display-referred
//     already and the boost overshoots them, so where PhotoMaskPass says a
//     photograph is the nearest surface the multiplier goes back to 1.0.
//
// It runs AFTER ToneMapping (a print grade belongs in display-referred
// space) but the composer's buffers are linear until the final encode, so
// the shader steps into an approximate display space and back out. It merges
// into the existing Vignette/ToneMapping EffectPass — no extra pass.
//
// A fourth job follows: the develop stage, a Lightroom-shaped set of
// adjustments (sceneGradeProfiles.ts). It is a transcription of
// `developDisplay` there, which is the reference. Two uniform branches keep
// it cheap: the whole stage is skipped when every value is at identity (the
// Flat profile), and the eight-band mixer, the only part with a loop and a
// second HSV round trip, is skipped when no band is set, which is the
// shipped case.
const BAND_CENTERS_TURNS = HUE_BANDS.map(
  (band) => HUE_BAND_CENTERS[band] / 360,
);
const bandSpan = (i: number, step: 1 | -1) => {
  const n = BAND_CENTERS_TURNS.length;
  const from = BAND_CENTERS_TURNS[i]!;
  const to = BAND_CENTERS_TURNS[(i + n + step) % n]!;
  return ((((to - from) * step) % 1) + 1) % 1;
};
const glslFloats = (values: readonly number[]) =>
  values.map((value) => value.toFixed(6)).join(", ");

const DEVELOP_GLSL = `
  uniform float uDevelop;    // 1 while either theme's develop stage is live
  uniform float uDevMixerOn; // 1 while either theme sets a mixer band
  uniform vec4 uDevA;        // exposure (stops), temp, tint, contrast
  uniform vec4 uDevB;        // blacks, whites, shadows, highlights
  uniform vec4 uDevC;        // saturation, vibrance, vignette, vignette midpoint
  uniform vec3 uDevMixer[8]; // per band: hue, sat, lum

  const float BAND_CENTER[8] = float[8](${glslFloats(BAND_CENTERS_TURNS)});
  const float BAND_LEFT[8] = float[8](${glslFloats(
    BAND_CENTERS_TURNS.map((_, i) => bandSpan(i, -1)),
  )});
  const float BAND_RIGHT[8] = float[8](${glslFloats(
    BAND_CENTERS_TURNS.map((_, i) => bandSpan(i, 1)),
  )});

  vec3 rgb2hsv(const in vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(const in vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // Triangular partition of unity over the eight band centres.
  float bandWeight(const in float h, const in int i) {
    float d = fract(h - BAND_CENTER[i] + 0.5) - 0.5;
    return d < 0.0
      ? clamp(1.0 + d / BAND_LEFT[i], 0.0, 1.0)
      : clamp(1.0 - d / BAND_RIGHT[i], 0.0, 1.0);
  }

  vec3 developStage(const in vec3 display, const in vec2 uv) {
    // White balance and exposure in linear display light.
    vec3 wb = vec3(
      1.0 + 0.25 * uDevA.y + 0.10 * uDevA.z,
      1.0 - 0.15 * uDevA.z,
      1.0 - 0.25 * uDevA.y + 0.10 * uDevA.z
    );
    wb /= lumc(wb);
    vec3 x = pow(pow(display, vec3(2.2)) * wb * exp2(uDevA.x), vec3(0.4545454545));

    // Tone: end-weighted blacks and whites, band-limited shadows and
    // highlights, then the contrast S about mid grey.
    x += uDevB.x * 0.5 * (1.0 - x) * (1.0 - x);
    x += uDevB.y * 0.75 * x * x;
    x = clamp(x, 0.0, 1.0);
    x += uDevB.z * 0.5 * smoothstep(0.0, 0.25, x) * (1.0 - smoothstep(0.25, 0.7, x));
    x += uDevB.w * 0.5 * smoothstep(0.3, 0.75, x) * (1.0 - smoothstep(0.75, 1.0, x));
    x = clamp(x, 0.0, 1.0);
    // "flat" is a GLSL keyword, hence the name.
    vec3 sCurve = x * x * (3.0 - 2.0 * x);
    vec3 flattened = 0.5 + (x - 0.5) * 0.6;
    x = uDevA.w >= 0.0 ? mix(x, sCurve, uDevA.w) : mix(x, flattened, -uDevA.w);

    // Saturation and vibrance about luma.
    vec3 hsv = rgb2hsv(x);
    float l = lumc(x);
    x = clamp(vec3(l) + (x - vec3(l)) * (1.0 + uDevC.x + uDevC.y * (1.0 - hsv.y)), 0.0, 1.0);

    // The mixer, gated off near grey.
    if (uDevMixerOn > 0.5) {
      hsv = rgb2hsv(x);
      float gate = clamp(hsv.y / 0.15, 0.0, 1.0);
      vec3 adjust = vec3(0.0);
      for (int i = 0; i < 8; i++) adjust += bandWeight(hsv.x, i) * uDevMixer[i];
      adjust *= gate;
      hsv.x += adjust.x * (60.0 / 360.0);
      hsv.y = clamp(hsv.y * (1.0 + adjust.y * (adjust.y >= 0.0 ? 1.5 : 1.0)), 0.0, 1.0);
      hsv.z = clamp(hsv.z * (1.0 + adjust.z * 0.5), 0.0, 1.0);
      x = hsv2rgb(hsv);
    }

    // Post vignette, elliptical with the frame.
    float r = length((uv - 0.5) * 2.0);
    x *= 1.0 + uDevC.z * smoothstep(uDevC.w, 1.42, r);
    return clamp(x, 0.0, 1.0);
  }
`;

const GRADE_FRAGMENT = `
  uniform float uDark; // 0 light … 1 dark, damped in lockstep with the sky
  uniform float uLightCurve;
  uniform float uDarkCurve;
  uniform float uLightToeTint;
  uniform float uDarkToeTint;
  uniform float uLightChromaBoost;
  uniform float uDarkChromaBoost;
  uniform sampler2D uPhotoMask;      // PhotoMaskPass: 1 where a photograph was drawn
  uniform sampler2D uPhotoMaskDepth; // and how deep, so a prop in front still grades
  uniform sampler2D uSceneDepth;     // the composer's depth, handed over by the pass
  uniform float uPhotoChromaProtection;

  float lumc(const in vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  ${DEVELOP_GLSL}

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 d = pow(max(inputColor.rgb, 0.0), vec3(0.4545454545));

    float curve = mix(uLightCurve, uDarkCurve, uDark);
    d = mix(d, d * d * (3.0 - 2.0 * d), curve);

    float l = lumc(d);
    float toe = 8.0 * l * max(0.0, 1.0 - 2.0 * l);
    vec3 toeHue = mix(vec3(1.00, 0.82, 0.60), vec3(0.50, 0.66, 1.00), uDark);
    d += toeHue * toe * mix(uLightToeTint, uDarkToeTint, uDark);

    l = lumc(d);
    vec3 keyHue = mix(vec3(1.012, 1.000, 0.978), vec3(1.016, 0.998, 0.968), uDark);
    d *= mix(vec3(1.0), keyHue, smoothstep(0.40, 0.95, l));

    l = lumc(d);
    float band = smoothstep(0.30, 0.70, l) * (1.0 - smoothstep(0.84, 1.00, l));
    float chromaBoost = mix(uLightChromaBoost, uDarkChromaBoost, uDark);
    float sat = 1.05 + chromaBoost * band;
    // A photograph keeps the file's own chroma (photoMaskLayer.ts). The mask
    // is half resolution and knows nothing about occluders, so its depth and
    // the scene's are compared in view space: the mask counts only where the
    // photograph is the nearest surface, with 2 cm of slack for the coarser
    // sample. Both depths are read raw rather than through readDepth, because
    // asking for the depth attribute would re-sort this effect ahead of tone
    // mapping (see GradeEffect); the pass hands the composer's depth over.
    float photo = 0.0;
    if (uPhotoChromaProtection > 0.5) {
      photo = texture2D(uPhotoMask, uv).r;
      float photoDepth = texture2D(uPhotoMaskDepth, uv).r;
      float sceneDepth = texture2D(uSceneDepth, uv).r;
      #ifdef USE_REVERSED_DEPTH_BUFFER
        photoDepth = 1.0 - photoDepth;
        sceneDepth = 1.0 - sceneDepth;
      #endif
      photo *= step(getViewZ(sceneDepth) - 0.02, getViewZ(photoDepth));
      photo = clamp(photo, 0.0, 1.0);
    }
    sat = mix(sat, 1.0, photo);
    d = max(vec3(0.0), vec3(l) + (d - vec3(l)) * sat);

    if (uDevelop > 0.5) d = developStage(d, uv);

    outputColor = vec4(pow(d, vec3(2.2)), inputColor.a);
  }
`;

class GradeEffect extends Effect {
  constructor(
    dark: number,
    settings: SceneColorGradeSettings,
    photoMask: PhotoMaskPass,
  ) {
    super("GradeEffect", GRADE_FRAGMENT, {
      // No EffectAttribute.DEPTH here, although the mask's occlusion test
      // reads depth. postprocessing sorts the effects of a merged pass by
      // their attribute bits, so declaring DEPTH moved this grade AHEAD of
      // Vignette and ToneMapping and ran it on raw HDR, where the S-curve
      // goes negative above 1.5: the lamp mouth turned blue, the hot cores
      // black. The composer's depth arrives through PhotoMaskPass instead.
      // SRC returns the shader's own output verbatim — a grade replaces the
      // frame, it does not composite over it.
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ["uDark", new Uniform(dark)],
        ["uLightCurve", new Uniform(settings.light.curve)],
        ["uDarkCurve", new Uniform(settings.dark.curve)],
        ["uLightToeTint", new Uniform(settings.light.toeTint)],
        ["uDarkToeTint", new Uniform(settings.dark.toeTint)],
        ["uLightChromaBoost", new Uniform(settings.light.chromaBoost)],
        ["uDarkChromaBoost", new Uniform(settings.dark.chromaBoost)],
        // The pass hands back the same two texture objects for its whole
        // life, resizes included, so these are bound once. The scene depth
        // arrives later, when the composer creates it, and Grade keeps it
        // current from the frame loop.
        ["uPhotoMask", new Uniform(photoMask.mask)],
        ["uPhotoMaskDepth", new Uniform(photoMask.depth)],
        ["uSceneDepth", new Uniform(photoMask.sceneDepth)],
        ["uPhotoChromaProtection", new Uniform(1)],
        ["uDevelop", new Uniform(0)],
        ["uDevMixerOn", new Uniform(0)],
        ["uDevA", new Uniform(new Vector4())],
        ["uDevB", new Uniform(new Vector4())],
        ["uDevC", new Uniform(new Vector4(0, 0, 0, 0.5))],
        ["uDevMixer", new Uniform(HUE_BANDS.map(() => new Vector3()))],
      ]),
    });
  }
}

/** The develop stage at one point of the theme crossfade, written straight
 * into the uniforms (no allocation: this runs every frame). The two themes
 * blend on the same damped `uDark` the rest of the grade uses. */
function writeDevelopUniforms(
  uniforms: Map<string, Uniform>,
  light: SceneDevelopSettings,
  dark: SceneDevelopSettings,
  t: number,
) {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  (uniforms.get("uDevA")!.value as Vector4).set(
    lerp(light.exposure, dark.exposure),
    lerp(light.temp, dark.temp),
    lerp(light.tint, dark.tint),
    lerp(light.contrast, dark.contrast),
  );
  (uniforms.get("uDevB")!.value as Vector4).set(
    lerp(light.blacks, dark.blacks),
    lerp(light.whites, dark.whites),
    lerp(light.shadows, dark.shadows),
    lerp(light.highlights, dark.highlights),
  );
  (uniforms.get("uDevC")!.value as Vector4).set(
    lerp(light.saturation, dark.saturation),
    lerp(light.vibrance, dark.vibrance),
    lerp(light.vignette, dark.vignette),
    lerp(light.vignetteMidpoint, dark.vignetteMidpoint),
  );
  const mixer = uniforms.get("uDevMixer")!.value as Vector3[];
  HUE_BANDS.forEach((band, i) => {
    const a = light.mixer[band];
    const b = dark.mixer[band];
    mixer[i]!.set(lerp(a.hue, b.hue), lerp(a.sat, b.sat), lerp(a.lum, b.lum));
  });
}

function Grade({
  dark,
  settings,
  develop,
  photoMask,
  chromaProtection,
}: {
  dark: boolean;
  settings: SceneColorGradeSettings;
  develop: SceneDevelopByTheme;
  photoMask: PhotoMaskPass;
  chromaProtection: boolean;
}) {
  // Seeded from the mounted theme so a dark first paint never ramps up from
  // the light grade; after that uDark damps at the sky dome's rate, so the
  // grade and the sky cross the theme flip together.
  const effect = useMemo(
    () => new GradeEffect(dark ? 1 : 0, settings, photoMask),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useDispose(effect);
  effect.uniforms.get("uLightCurve")!.value = settings.light.curve;
  effect.uniforms.get("uDarkCurve")!.value = settings.dark.curve;
  effect.uniforms.get("uLightToeTint")!.value = settings.light.toeTint;
  effect.uniforms.get("uDarkToeTint")!.value = settings.dark.toeTint;
  effect.uniforms.get("uLightChromaBoost")!.value = settings.light.chromaBoost;
  effect.uniforms.get("uDarkChromaBoost")!.value = settings.dark.chromaBoost;
  effect.uniforms.get("uPhotoChromaProtection")!.value = chromaProtection
    ? 1
    : 0;
  effect.uniforms.get("uDevelop")!.value =
    developIsIdentity(develop.light) && developIsIdentity(develop.dark) ? 0 : 1;
  effect.uniforms.get("uDevMixerOn")!.value =
    mixerIsIdentity(develop.light) && mixerIsIdentity(develop.dark) ? 0 : 1;
  // Written at render as well as per frame, so a profile change lands on
  // the next paint even while the frame loop is resting.
  writeDevelopUniforms(
    effect.uniforms,
    develop.light,
    develop.dark,
    effect.uniforms.get("uDark")!.value as number,
  );
  const developRef = useRef(develop);
  developRef.current = develop;
  useFrame((_, delta) => {
    const u = effect.uniforms.get("uDark")!;
    u.value = MathUtils.damp(u.value as number, dark ? 1 : 0, 3.5, delta);
    // The composer creates its depth texture when a pass first asks for it,
    // which may be after this effect was built; the pass holds the latest.
    const depth = effect.uniforms.get("uSceneDepth")!;
    if (depth.value !== photoMask.sceneDepth)
      depth.value = photoMask.sceneDepth;
    writeDevelopUniforms(
      effect.uniforms,
      developRef.current.light,
      developRef.current.dark,
      u.value as number,
    );
  });
  return <primitive object={effect} dispose={null} />;
}

/** The photo mask as a composer child. Disposal rides on the mount, so the
 * half-resolution target and its depth texture exist only while the grade
 * that reads them is in the chain. */
function PhotoMask({ pass }: { pass: PhotoMaskPass }) {
  useDispose(pass);
  return <primitive object={pass} dispose={null} />;
}

// AMD FidelityFX RCAS, ported from Three's SharpenNode to the current WebGL
// composer. It is deliberately a convolution effect: postprocessing isolates
// it after the display-referred grade, so neighbour samples and the center are
// in the same color space. Trying to hide these taps inside GradeEffect would
// sample the pre-tonemapped inputBuffer and create colored edge halos.
const ADAPTIVE_SHARPEN_FRAGMENT = `
  uniform float uAmount;

  float rcasLuma(const in vec3 color) {
    return color.g + 0.5 * (color.r + color.b);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 e = inputColor.rgb;
    vec3 b = texture2D(inputBuffer, uv + vec2(0.0, -texelSize.y)).rgb;
    vec3 d = texture2D(inputBuffer, uv + vec2(-texelSize.x, 0.0)).rgb;
    vec3 f = texture2D(inputBuffer, uv + vec2(texelSize.x, 0.0)).rgb;
    vec3 h = texture2D(inputBuffer, uv + vec2(0.0, texelSize.y)).rgb;

    vec3 mn4 = min(min(b, d), min(f, h));
    vec3 mx4 = max(max(b, d), max(f, h));
    vec3 hitMin = min(mn4, e) / max(mx4 * 4.0, vec3(1e-4));
    vec3 hitMax = (vec3(1.0) - max(mx4, e)) /
      min(mn4 * 4.0 - 4.0, vec3(-1e-4));
    vec3 lobeRgb = max(-hitMin, hitMax);
    float lobe = max(
      -(0.25 - 1.0 / 16.0),
      min(max(lobeRgb.r, max(lobeRgb.g, lobeRgb.b)), 0.0)
    );

    float bL = rcasLuma(b);
    float dL = rcasLuma(d);
    float eL = rcasLuma(e);
    float fL = rcasLuma(f);
    float hL = rcasLuma(h);
    float noise = (bL + dL + fL + hL) * 0.25 - eL;
    float noiseRange = max(max(bL, dL), max(eL, max(fL, hL))) -
      min(min(bL, dL), min(eL, min(fL, hL)));
    float noiseFactor = 1.0 - 0.5 * clamp(
      abs(noise) / max(noiseRange, 1.0 / 65536.0),
      0.0,
      1.0
    );

    // 1.15 is a mild RCAS sharpness before the scale-derived amount. The
    // amount is capped on the CPU, so even a heavily reduced framebuffer
    // cannot reach the ringing-prone reference maximum.
    float effectiveLobe = lobe * exp2(-1.15) * uAmount * noiseFactor;
    vec3 result = ((b + d + f + h) * effectiveLobe + e) /
      (4.0 * effectiveLobe + 1.0);
    outputColor = vec4(max(result, 0.0), inputColor.a);
  }
`;

class AdaptiveSharpenEffect extends Effect {
  constructor(amount: number) {
    super("AdaptiveSharpenEffect", ADAPTIVE_SHARPEN_FRAGMENT, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([["uAmount", new Uniform(amount)]]),
    });
  }
}

function AdaptiveSharpen({ amount }: { amount: number }) {
  const effect = useMemo(() => new AdaptiveSharpenEffect(amount), []); // eslint-disable-line react-hooks/exhaustive-deps
  useDispose(effect);
  effect.uniforms.get("uAmount")!.value = amount;
  return <primitive object={effect} dispose={null} />;
}

// Pixel-art finish (see pixelArt.ts). Convolution because it samples the
// input away from its own uv, which also keeps it in a pass of its own, LAST,
// so SMAA has already run and nothing can re-soften the art grid.
//
// Everything happens in display space: the reference look is an 8-bit file,
// and 8-bit files quantise perceptual values, not linear light. The composer's
// buffers are still linear here, so step in, work, step out, same as Grade.
//
// Two looks are resident at once, OUTER and INNER, split by a circle that
// grows from the clicked board: inside the circle is the look being switched
// to, outside is the one being left. Either may be "off" (pass the input
// through). At rest both are the same look and the radius is irrelevant. The
// circle's edge is broken up by the same Bayer threshold the dither uses, so
// the wipe front is a band of art pixels rather than an anti-aliased curve.
// Each look has its own grid; the front is judged on the incoming grid, so
// the new art pixels are what the edge is made of.
const PIXEL_ART_FRAGMENT = `
  uniform float uOuterBlock; // art pixel edge in framebuffer pixels, outside
  uniform float uInnerBlock; // same, inside the circle
  uniform vec4 uOuter;       // (on, levels, dither, palette) outside
  uniform vec4 uInner;       // same, inside
  uniform vec2 uOrigin;      // wipe centre, uv
  uniform float uRadius;     // wipe radius, aspect-corrected uv units

  const int PALETTE_SIZE = ${DB32_PALETTE.length};
  const vec3 PALETTE[PALETTE_SIZE] = vec3[PALETTE_SIZE](
    ${paletteGlsl(DB32_PALETTE)}
  );

  // 4x4 Bayer by bit twiddling, indexed by BLOCK so the pattern rides the art
  // grid. Returns the threshold centred on zero.
  float bayer4(const in vec2 cell) {
    ivec2 i = ivec2(cell) & 3;
    int a = i.x ^ i.y;
    int v = ((a & 1) << 3) | ((i.y & 1) << 2) | (a & 2) | ((i.y & 2) >> 1);
    return (float(v) + 0.5) / 16.0 - 0.5;
  }

  vec3 nearestPaletteColor(const in vec3 c) {
    vec3 best = PALETTE[0];
    float bestDistance = 1e9;
    for (int i = 0; i < PALETTE_SIZE; i++) {
      vec3 d = c - PALETTE[i];
      // Perceptual-ish weights; plain Euclidean over-serves blue.
      float distance = dot(d * d, vec3(0.30, 0.59, 0.11));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = PALETTE[i];
      }
    }
    return best;
  }

  vec3 finish(const in vec3 linearBoxed, const in float threshold, const in vec4 look) {
    vec3 d = pow(max(linearBoxed, 0.0), vec3(0.4545454545));
    float t = threshold * look.z;
    if (look.w > 0.5) {
      // One palette "step" is roughly a sixth of the range.
      d = nearestPaletteColor(d + t / 6.0);
    } else {
      float steps = max(look.y - 1.0, 1.0);
      d = floor((d + t / steps) * steps + 0.5) / steps;
    }
    return pow(clamp(d, 0.0, 1.0), vec3(2.2));
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Which side of the wipe this pixel is on, judged on the incoming grid.
    // The band is four art pixels wide and the threshold decides, per block,
    // where inside it the front sits, which is what makes the edge read as
    // dithered.
    vec2 frontCell = floor(uv * resolution / uInnerBlock);
    vec2 frontUv = (frontCell + 0.5) * uInnerBlock * texelSize;
    float r = length((frontUv - uOrigin) * vec2(aspect, 1.0));
    float band = uInnerBlock * texelSize.y * 4.0;
    bool inside = r + bayer4(frontCell) * band < uRadius;
    vec4 look = inside ? uInner : uOuter;
    float block = inside ? uInnerBlock : uOuterBlock;

    if (look.x < 0.5) {
      outputColor = inputColor;
      return;
    }

    vec2 cell = floor(uv * resolution / block);
    float threshold = bayer4(cell);
    vec2 center = (cell + 0.5) * block;
    // Four bilinear taps a quarter-block off centre: a cheap box filter that
    // covers the block, so thin geometry (railings, grass) fades rather than
    // flickers as it crosses cells.
    float o = block * 0.25;
    vec3 c = texture2D(inputBuffer, (center + vec2(-o, -o)) * texelSize).rgb
           + texture2D(inputBuffer, (center + vec2( o, -o)) * texelSize).rgb
           + texture2D(inputBuffer, (center + vec2(-o,  o)) * texelSize).rgb
           + texture2D(inputBuffer, (center + vec2( o,  o)) * texelSize).rgb;
    outputColor = vec4(finish(c * 0.25, threshold, look), inputColor.a);
  }
`;

const PIXEL_LOOK_OFF = new Vector4(0, 8, 0, 0);

function pixelLookUniform(plan: PixelArtPlan | null, target: Vector4) {
  if (!plan) return target.copy(PIXEL_LOOK_OFF);
  return target.set(1, plan.levels, plan.dither, plan.palette ? 1 : 0);
}

class PixelArtEffect extends Effect {
  constructor(blockPixels: number) {
    super("PixelArtEffect", PIXEL_ART_FRAGMENT, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ["uOuterBlock", new Uniform(blockPixels)],
        ["uInnerBlock", new Uniform(blockPixels)],
        ["uOuter", new Uniform(PIXEL_LOOK_OFF.clone())],
        ["uInner", new Uniform(PIXEL_LOOK_OFF.clone())],
        ["uOrigin", new Uniform(new Vector2(0.5, 0.5))],
        ["uRadius", new Uniform(0)],
      ]),
    });
  }
}

/**
 * The wipe, in frame time. `look` is the store's target; the component keeps
 * the look being left as OUTER until the circle has covered the frame, then
 * promotes the target and, if the target is "off", asks to be unmounted.
 * Re-targeting mid-wipe restarts the circle from the new origin with the old
 * target as the new outside, which is honest about what is on screen at
 * that instant everywhere except inside the unfinished circle.
 */
function PixelArt({
  look,
  origin,
  onSettled,
}: {
  look: PixelLook;
  origin: readonly [number, number, number] | null;
  onSettled: (look: PixelLook) => void;
}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const search = useMemo(
    () => (typeof window === "undefined" ? "" : window.location.search),
    [],
  );
  const effect = useMemo(
    () =>
      new PixelArtEffect(
        pixelArtBlockPixels(
          pixelArtPlanFor(look === "off" ? "levels" : look, search).blockCss,
          gl.getPixelRatio(),
        ),
      ),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useDispose(effect);

  const wipe = useRef<{
    outer: PixelLook;
    inner: PixelLook;
    t: number;
    originWorld: Vector3 | null;
    originUv: [number, number];
    settled: boolean;
  }>({
    // First mount: the look is already on (URL seed) or about to wipe in
    // from nothing. Either way the frame starts as "off" outside.
    outer: "off",
    inner: look,
    t: look === "off" ? 1 : 0,
    originWorld: null,
    originUv: [0.5, 0.5],
    settled: false,
  });
  const lastLook = useRef<PixelLook | null>(null);
  if (lastLook.current !== look) {
    const w = wipe.current;
    if (lastLook.current !== null) {
      w.outer = w.inner;
      w.inner = look;
      w.t = 0;
      w.settled = false;
    }
    w.originWorld = origin ? new Vector3(...origin) : null;
    lastLook.current = look;
  }
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const scratch = useMemo(
    () => ({ ndc: new Vector3(), uniform: new Vector4() }),
    [],
  );

  useFrame((state, delta) => {
    const w = wipe.current;
    const uniforms = effect.uniforms;
    const outerPlan =
      w.outer === "off" ? null : pixelArtPlanFor(w.outer, search);
    const innerPlan =
      w.inner === "off" ? null : pixelArtPlanFor(w.inner, search);
    // Blocks are authored in CSS pixels; the ladder moves the framebuffer
    // ratio underneath them, so re-derive every frame (cheap, and the only
    // way the art grid holds still across a ratio step). A side that is off
    // borrows the other's grid: the front is judged on the inner grid, and
    // the outer value is never read for an "off" outside.
    const ratio = gl.getPixelRatio();
    uniforms.get("uInnerBlock")!.value = pixelArtBlockPixels(
      (innerPlan ?? outerPlan)?.blockCss ?? 1,
      ratio,
    );
    uniforms.get("uOuterBlock")!.value = pixelArtBlockPixels(
      (outerPlan ?? innerPlan)?.blockCss ?? 1,
      ratio,
    );

    // Project the clicked board each frame: the camera can move during the
    // wipe and the circle should stay pinned to the board, not the screen.
    if (w.originWorld) {
      scratch.ndc.copy(w.originWorld).project(camera);
      if (scratch.ndc.z < 1) {
        w.originUv[0] = MathUtils.clamp(scratch.ndc.x * 0.5 + 0.5, -0.5, 1.5);
        w.originUv[1] = MathUtils.clamp(scratch.ndc.y * 0.5 + 0.5, -0.5, 1.5);
      }
    } else {
      w.originUv[0] = 0.5;
      w.originUv[1] = 0.5;
    }
    (uniforms.get("uOrigin")!.value as Vector2).set(
      w.originUv[0],
      w.originUv[1],
    );

    const aspect = state.size.width / Math.max(1, state.size.height);
    const cover = pixelWipeCoverRadius(w.originUv, aspect);
    if (w.t < 1) {
      w.t = Math.min(1, w.t + delta / PIXEL_WIPE_SECONDS);
    }
    // Ease-out: the front leaves the board fast and coasts to the corners.
    const eased = 1 - (1 - w.t) * (1 - w.t);
    uniforms.get("uRadius")!.value = eased * cover * 1.02;

    pixelLookUniform(outerPlan, uniforms.get("uOuter")!.value as Vector4);
    pixelLookUniform(innerPlan, uniforms.get("uInner")!.value as Vector4);

    if (w.t >= 1 && !w.settled) {
      w.settled = true;
      w.outer = w.inner;
      onSettledRef.current(w.inner);
    }
  });
  return <primitive object={effect} dispose={null} />;
}

function SideLens({
  seated,
  captureCenter,
}: {
  seated: boolean;
  captureCenter: number | null;
}) {
  const viewportWidth = useThree((state) => state.size.width);
  const navRightPx = useStacks((state) => state.desktopNavRightPx);
  const detailsLeftPx = useStacks((state) => state.desktopDetailsLeftPx);
  const screenshot = useScreenshotMode();
  const center = effectiveCaptureLensCenter(captureCenter, screenshot.enabled);
  const lens = useMemo(
    () =>
      sideLensPlan({
        viewportWidth,
        navRightPx,
        detailsLeftPx,
        seated,
        captureCenter: center,
      }),
    [center, detailsLeftPx, navRightPx, seated, viewportWidth],
  );

  return (
    <TiltShift2
      key={`${lens.line.start[0]}`}
      start={lens.line.start}
      end={lens.line.end}
      blur={lens.blur}
      taper={lens.taper}
    />
  );
}

/** Keep the DoF targets mounted while its live tuning changes. Stable
 * constructor values here, live values through `applyShelfDepthOfFieldTuning`
 * before the browser can paint the next frame. */
function LiveBokehDepthOfField({
  target,
  focusRange,
  bokehScale,
  resolutionScale,
}: ShelfDepthOfFieldTuning) {
  const effect = useRef<DepthOfFieldEffect | null>(null);

  useLayoutEffect(() => {
    if (!effect.current) return;
    applyShelfDepthOfFieldTuning(effect.current, {
      focusRange,
      bokehScale,
      resolutionScale,
    });
  }, [bokehScale, focusRange, resolutionScale]);

  // Focus pull. A prop brought to the camera (the Projects Mac) sits four
  // units in front of the shelf's focal plane and would arrive as bokeh; while
  // its flight reports a weight, the target slides from the shelf toward it.
  // The wrapper's `target` Vector3 is the one the effect measures every
  // frame, so writing it here is enough, and the shelf value is restored the
  // frame the pull lets go.
  const pulled = useRef(false);
  useFrame(() => {
    const focus = effect.current?.target;
    if (!focus) return;
    if (focusPull.weight <= 0) {
      if (!pulled.current) return;
      pulled.current = false;
      focus.set(target[0], target[1], target[2]);
      return;
    }
    pulled.current = true;
    focusPullTarget(target, focusPull, focus);
  });

  return (
    <DepthOfField
      ref={effect}
      target={target}
      focusRange={2.2}
      bokehScale={1}
      resolutionScale={0.5}
    />
  );
}

/**
 * Resize the composer's render targets when the DEVICE PIXEL RATIO changes.
 *
 * `@react-three/postprocessing` only calls `composer.setSize` from an effect
 * keyed on `useThree().size`, and that size is in CSS pixels. Changing `dpr`
 * resizes the renderer's drawing buffer without touching it, so the composer
 * goes on rendering into targets at the previous resolution and blits a
 * mismatched buffer to the screen — visible as a flash.
 *
 * This never mattered while the pixel ratio moved only at profile
 * transitions, which is what the "N8AO x adaptive-dpr is a known-bad pair"
 * note at the top of this file is about. The resolution axis now steps it
 * twelve ways, so the resize has to be wired up properly.
 *
 * Done in the frame loop rather than an effect, and read off the renderer
 * rather than from React state, so no frame can be drawn between the ratio
 * changing and the buffers following it. Priority stays at 0: the composer
 * renders at 1, and r3f runs subscribers in ascending priority, so this lands
 * before the frame it is correcting. `composer.setSize` takes CSS pixels and
 * re-derives the rest via `getDrawingBufferSize`, so passing the unchanged
 * size is both correct and what resizes every pass.
 */
function ComposerPixelRatio() {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const { composer } = useContext(EffectComposerContext);
  const applied = useRef<number | null>(null);

  useFrame(() => {
    const ratio = gl.getPixelRatio();
    if (!composer || ratio === applied.current) return;
    applied.current = ratio;
    composer.setSize(size.width, size.height);
  });

  return null;
}

export default function Effects({
  dark,
  plan,
  sharpenAmount = 0,
}: {
  dark: boolean;
  plan: SceneQualityPlan["effects"];
  /** Scale-derived RCAS strength. Zero leaves the pass out of the composer. */
  sharpenAmount?: number;
}) {
  const baseColorGrade = useSceneColorGradeSettings();
  const gradeProfile = useSceneGradeProfile();
  const performanceSettings = useScenePerformanceSettings();
  const photographTreatment = usePhotographTreatment();
  const { cinematicPlus, depthOfFieldModel, opticalDepthOfField } =
    useSceneQualityControls();
  const sun = useCinematicSun();
  // The photo mask the grade reads (ADR 0023), drawn through the camera the
  // composer renders with. It mounts, and holds GPU memory, only with the
  // grade, because the grade is its only reader; the object itself is kept
  // here so the grade can bind its textures once.
  const camera = useThree((state) => state.camera);
  const photoMask = useMemo(() => new PhotoMaskPass(camera), [camera]);
  const look = useMemo(
    () =>
      sceneGradeLookFor(
        gradeProfile,
        sceneColorGradeFor(baseColorGrade, cinematicPlus),
      ),
    [baseColorGrade, cinematicPlus, gradeProfile],
  );
  const colorGrade = look.base;
  // DoF is the expensive world-space blur and remains disabled in the
  // minimal effects tier. The
  // owner-approved side tilt shift is the cheaper compositional treatment;
  // it survives in finish mode and can still be isolated with ?notiltshift.
  const activeUnit = useStacks((state) => state.activeUnit);
  const golfFocused = useStacks((state) => state.golfFocused);
  const seated = useStacks((state) => state.seated);
  // Keyed to the curtain, not the ride phase: the room keeps its bokeh,
  // occlusion, tilt shift and god rays through the visible half of the
  // donning flight, loses them only once the static curtain is opaque, and
  // has them back under the opaque return hold before the shelf shows.
  const visionRideRoomHidden = useStacks((state) => state.visionRideRoomHidden);
  const visionRideRetroFxEnabled = useVisionRideRetroFxEnabled();
  const visionRidePreview = useVisionRidePreviewOverrides();
  const captureLensCenter = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : captureLensCenterFromSearch(window.location.search),
    [],
  );
  // The pixel finish. `pixelLook` is the store's target; `settledPixel` is
  // the look the whole frame shows once the wipe is done, and it is what
  // decides whether the bokeh and side lens stay mounted: a pixel grid over a
  // defocus blur reads as mud, so both go the moment the wipe completes and
  // come back the moment a wipe to "off" completes. The pass itself stays
  // mounted until a wipe to "off" has finished, so the photograph is never
  // cut back in under an unfinished circle.
  const authoredPixelLook = useStacks((state) => state.pixelLook);
  const pixelLook =
    visionRideRoomHidden && visionRidePreview.finishPreview !== "authored"
      ? visionRidePreview.finishPreview
      : authoredPixelLook;
  const pixelOrigin = useStacks((state) => state.pixelOrigin);
  const [settledPixel, setSettledPixel] = useState<PixelLook>(pixelLook);
  const pixelMounted = pixelLook !== "off" || settledPixel !== "off";
  const pixelBlurOff = settledPixel !== "off";
  const tiltShift = useMemo(
    () =>
      tiltShiftEnabled(
        plan.composer === "direct" ? "off" : plan.composer,
        plan.depthOfField,
        !performanceSettings.sideTiltShift ||
          pixelBlurOff ||
          visionRideRoomHidden,
      ),
    [
      performanceSettings.sideTiltShift,
      pixelBlurOff,
      plan.composer,
      plan.depthOfField,
      visionRideRoomHidden,
    ],
  );
  const {
    depthOfField: planDepthOfField,
    depthOfFieldBokehScale,
    depthOfFieldResolutionScale,
  } = plan;
  const depthOfFieldTuning = useMemo(
    () =>
      resolveShelfDepthOfFieldTuning({
        plan: {
          depthOfField: planDepthOfField,
          depthOfFieldBokehScale,
          depthOfFieldResolutionScale,
        },
        activeUnit,
        golfFocused,
        seated,
        isolated:
          performanceSettings.skipDepthOfField ||
          pixelBlurOff ||
          visionRideRoomHidden,
      }),
    [
      activeUnit,
      depthOfFieldBokehScale,
      depthOfFieldResolutionScale,
      golfFocused,
      performanceSettings.skipDepthOfField,
      pixelBlurOff,
      planDepthOfField,
      seated,
      visionRideRoomHidden,
    ],
  );
  return (
    <EffectComposer multisampling={plan.multisampling} stencilBuffer>
      {/* First, right behind the render pass: the photographs alone, into
          the mask the grade reads. It touches no composer buffer. */}
      {performanceSettings.colorGrade && <PhotoMask pass={photoMask} />}
      {plan.ambientOcclusion && !visionRideRoomHidden && (
        <N8AO
          halfRes={plan.ambientOcclusionHalfRes}
          quality={plan.ambientOcclusionQuality}
          aoRadius={0.32}
          distanceFalloff={0.8}
          intensity={2.4}
        />
      )}
      {/* Keep bloom on HDR practicals, not on the moon and white sky detail.
          The floor-lamp mouth and fixture faces are deliberately authored
          above 1.0; the dome is not. A higher threshold therefore gives the
          practicals room for a stronger optical shoulder without laying a
          global haze over the skyline. */}
      {plan.bloom && (
        <Bloom
          mipmapBlur
          levels={plan.bloomLevels}
          resolutionScale={plan.bloomResolutionScale}
          luminanceThreshold={
            visionRideRoomHidden
              ? visionRideRetroFxEnabled
                ? 0.82
                : 1.08
              : dark
                ? plan.bloomLuminanceThreshold.dark
                : plan.bloomLuminanceThreshold.light
          }
          luminanceSmoothing={
            visionRideRoomHidden
              ? visionRideRetroFxEnabled
                ? Math.max(0.24, plan.bloomLuminanceSmoothing)
                : Math.max(0.12, plan.bloomLuminanceSmoothing)
              : plan.bloomLuminanceSmoothing
          }
          intensity={
            visionRideRoomHidden
              ? visionRideRetroFxEnabled
                ? Math.max(1.9, plan.bloomIntensity.dark)
                : Math.max(1.05, plan.bloomIntensity.dark)
              : dark
                ? plan.bloomIntensity.dark
                : plan.bloomIntensity.light
          }
        />
      )}
      {/* Target the active shelf in world space instead of assuming the wide
          camera's 5.8-unit pose. Portrait layouts pull the camera back to 7.6;
          a fixed 6.05 focus distance put the focal plane in the foreground
          grass. The effect measures camera→target every frame, including the
          alternating unit depths and the About stop's lateral offset.
          Whether it mounts at all, and at what tuning, is decided in
          shelfDepthOfField.ts. */}
      {depthOfFieldTuning && depthOfFieldModel === "current" && (
        <LiveBokehDepthOfField {...depthOfFieldTuning} />
      )}
      {depthOfFieldTuning && depthOfFieldModel !== "current" && (
        <OpticalBokehPrototype
          target={depthOfFieldTuning.target}
          focusRange={depthOfFieldTuning.focusRange}
          bokehScale={depthOfFieldTuning.bokehScale}
          taps={
            depthOfFieldModel === "optical-prototype-16"
              ? OPTICAL_BOKEH_MATCHED_TAPS
              : depthOfFieldModel === "optical-prototype-64"
                ? OPTICAL_BOKEH_ULTRA_TAPS
                : OPTICAL_BOKEH_QUALITY_TAPS
          }
          tuning={opticalDepthOfField}
        />
      )}
      {/* Vertical focus line with softness growing toward the screen edges.
          This is part of the approved look, so finish mode keeps it. */}
      {tiltShift && (
        <SideLens seated={seated} captureCenter={captureLensCenter} />
      )}
      {/* A real radial-light pass: the scene depth buffer occludes the sun,
          so shelf edges and props cut visible shafts through it. Keeping the
          component itself behind Cinematic+ avoids all three of its render
          targets, texture samples, and per-frame work on every other mode. */}
      {cinematicPlus && !visionRideRoomHidden && !dark && sun && (
        <GodRays
          sun={sun}
          samples={60}
          density={0.97}
          decay={0.945}
          weight={0.5}
          exposure={0.76}
          clampMax={1}
          blur
          resolutionScale={0.5}
        />
      )}
      {/* Light theme eases the vignette because dark corners read as grime
          against a bright sky. */}
      <Vignette
        eskil={false}
        offset={0.34}
        darkness={
          visionRideRoomHidden && visionRideRetroFxEnabled
            ? 0.62
            : dark
              ? colorGrade.dark.vignette
              : colorGrade.light.vignette
        }
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {performanceSettings.colorGrade && (
        <Grade
          dark={dark}
          settings={colorGrade}
          develop={look.develop}
          photoMask={photoMask}
          chromaProtection={photographTreatment.chromaProtection}
        />
      )}
      {/* RCAS after an optical blur recreates the bright contour this
          model is meant to remove. The previous model keeps its approved
          finishing order; the optical comparison leaves lens-softened edges
          alone. */}
      {sharpenAmount > 0 && depthOfFieldModel === "current" && (
        <AdaptiveSharpen amount={sharpenAmount} />
      )}
      <SMAA />
      {/* Last on purpose: the art grid must be the final thing drawn. */}
      {pixelMounted && (
        <PixelArt
          look={pixelLook}
          origin={pixelOrigin}
          onSettled={setSettledPixel}
        />
      )}
      <ComposerPixelRatio />
    </EffectComposer>
  );
}
