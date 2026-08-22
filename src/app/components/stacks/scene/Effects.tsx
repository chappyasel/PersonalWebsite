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
import { useContext, useLayoutEffect, useMemo, useRef } from "react";
import { MathUtils, Uniform } from "three";

import { useCinematicSun } from "./cinematicSun";
import { captureLensCenterFromSearch, sideLensPlan } from "./lensGeometry";
import { type SceneQualityPlan, tiltShiftEnabled } from "./quality";
import {
  type SceneColorGradeSettings,
  sceneColorGradeFor,
  useSceneColorGradeSettings,
} from "./sceneColorGrade";
import { useScenePerformanceSettings } from "./scenePerformance";
import { useSceneQualityControls } from "./sceneQualityController";
import {
  SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE,
  installShelfDepthOfFieldFocusBand,
} from "./shelfDepthOfField";
import { depthOfFieldTargetForUnit } from "./worldLayout";

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
//
// It runs AFTER ToneMapping (a print grade belongs in display-referred
// space) but the composer's buffers are linear until the final encode, so
// the shader steps into an approximate display space and back out. It merges
// into the existing Vignette/ToneMapping EffectPass — no extra pass.
const GRADE_FRAGMENT = `
  uniform float uDark; // 0 light … 1 dark, damped in lockstep with the sky
  uniform float uLightCurve;
  uniform float uDarkCurve;
  uniform float uLightToeTint;
  uniform float uDarkToeTint;
  uniform float uLightChromaBoost;
  uniform float uDarkChromaBoost;

  float lumc(const in vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

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
    d = max(vec3(0.0), vec3(l) + (d - vec3(l)) * sat);

    outputColor = vec4(pow(d, vec3(2.2)), inputColor.a);
  }
`;

class GradeEffect extends Effect {
  constructor(dark: number, settings: SceneColorGradeSettings) {
    super("GradeEffect", GRADE_FRAGMENT, {
      // SRC returns the shader's own output verbatim — a grade replaces the
      // frame, it does not composite over it.
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ["uDark", new Uniform(dark)],
        ["uLightCurve", new Uniform(settings.light.curve)],
        ["uDarkCurve", new Uniform(settings.dark.curve)],
        ["uLightToeTint", new Uniform(settings.light.toeTint)],
        ["uDarkToeTint", new Uniform(settings.dark.toeTint)],
        ["uLightChromaBoost", new Uniform(settings.light.chromaBoost)],
        ["uDarkChromaBoost", new Uniform(settings.dark.chromaBoost)],
      ]),
    });
  }
}

function Grade({
  dark,
  settings,
}: {
  dark: boolean;
  settings: SceneColorGradeSettings;
}) {
  // Seeded from the mounted theme so a dark first paint never ramps up from
  // the light grade; after that uDark damps at the sky dome's rate, so the
  // grade and the sky cross the theme flip together.
  const effect = useMemo(
    () => new GradeEffect(dark ? 1 : 0, settings),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useDispose(effect);
  effect.uniforms.get("uLightCurve")!.value = settings.light.curve;
  effect.uniforms.get("uDarkCurve")!.value = settings.dark.curve;
  effect.uniforms.get("uLightToeTint")!.value = settings.light.toeTint;
  effect.uniforms.get("uDarkToeTint")!.value = settings.dark.toeTint;
  effect.uniforms.get("uLightChromaBoost")!.value = settings.light.chromaBoost;
  effect.uniforms.get("uDarkChromaBoost")!.value = settings.dark.chromaBoost;
  useFrame((_, delta) => {
    const u = effect.uniforms.get("uDark")!;
    u.value = MathUtils.damp(u.value as number, dark ? 1 : 0, 3.5, delta);
  });
  return <primitive object={effect} dispose={null} />;
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
  const lens = useMemo(
    () =>
      sideLensPlan({
        viewportWidth,
        navRightPx,
        detailsLeftPx,
        seated,
        captureCenter,
      }),
    [captureCenter, detailsLeftPx, navRightPx, seated, viewportWidth],
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

/** Keep the DoF targets mounted while its live tuning changes. The React
 * wrapper reconstructs the whole effect whenever bokeh, focus, or resolution
 * props change, so pass stable constructor values and update the effect's two
 * resolution owners directly before the browser can paint the next frame. */
function LiveBokehDepthOfField({
  target,
  focusRange,
  bokehScale,
  resolutionScale,
}: {
  target: [number, number, number];
  focusRange: number;
  bokehScale: number;
  resolutionScale: number;
}) {
  const effect = useRef<DepthOfFieldEffect | null>(null);

  useLayoutEffect(() => {
    if (!effect.current) return;
    installShelfDepthOfFieldFocusBand(effect.current);
    effect.current.bokehScale = bokehScale;
    effect.current.cocMaterial.focusRange = focusRange;
    effect.current.resolution.scale = resolutionScale;
    effect.current.blurPass.resolution.scale = resolutionScale;
  }, [bokehScale, focusRange, resolutionScale]);

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
  const performanceSettings = useScenePerformanceSettings();
  const { cinematicPlus } = useSceneQualityControls();
  const sun = useCinematicSun();
  const colorGrade = sceneColorGradeFor(baseColorGrade, cinematicPlus);
  // DoF is the expensive world-space blur and remains disabled in the
  // minimal effects tier. The
  // owner-approved side tilt shift is the cheaper compositional treatment;
  // it survives in finish mode and can still be isolated with ?notiltshift.
  const tiltShift = useMemo(
    () =>
      tiltShiftEnabled(
        plan.composer === "direct" ? "off" : plan.composer,
        plan.depthOfField,
        !performanceSettings.sideTiltShift,
      ),
    [performanceSettings.sideTiltShift, plan.composer, plan.depthOfField],
  );
  const activeUnit = useStacks((state) => state.activeUnit);
  const golfFocused = useStacks((state) => state.golfFocused);
  const seated = useStacks((state) => state.seated);
  const captureLensCenter = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : captureLensCenterFromSearch(window.location.search),
    [],
  );
  const focusTarget = useMemo<[number, number, number]>(
    () => [...depthOfFieldTargetForUnit(activeUnit)],
    [activeUnit],
  );
  return (
    <EffectComposer multisampling={plan.multisampling} stencilBuffer>
      {plan.ambientOcclusion && (
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
            dark
              ? plan.bloomLuminanceThreshold.dark
              : plan.bloomLuminanceThreshold.light
          }
          luminanceSmoothing={plan.bloomLuminanceSmoothing}
          intensity={
            dark ? plan.bloomIntensity.dark : plan.bloomIntensity.light
          }
        />
      )}
      {/* Target the active shelf in world space instead of assuming the wide
          camera's 5.8-unit pose. Portrait layouts pull the camera back to 7.6;
          a fixed 6.05 focus distance put the focal plane in the foreground
          grass. The effect measures camera→target every frame, including the
          alternating unit depths and the About stop's lateral offset. */}
      {plan.depthOfField && !seated && (
        <LiveBokehDepthOfField
          target={focusTarget}
          // Golf owns a real tee-to-green action axis. Keep the static
          // focal plane (never rack focus during a shot), but broaden its
          // accepted range enough that the club and distant cup stay legible.
          focusRange={golfFocused ? 16.5 : SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE}
          bokehScale={plan.depthOfFieldBokehScale}
          resolutionScale={plan.depthOfFieldResolutionScale}
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
      {cinematicPlus && !dark && sun && (
        <GodRays
          sun={sun}
          samples={60}
          density={0.97}
          decay={0.945}
          weight={0.5}
          exposure={0.68}
          clampMax={0.92}
          blur
          resolutionScale={0.5}
        />
      )}
      {/* Light theme eases the vignette because dark corners read as grime
          against a bright sky. */}
      <Vignette
        eskil={false}
        offset={0.34}
        darkness={dark ? colorGrade.dark.vignette : colorGrade.light.vignette}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {performanceSettings.colorGrade && (
        <Grade dark={dark} settings={colorGrade} />
      )}
      {sharpenAmount > 0 && <AdaptiveSharpen amount={sharpenAmount} />}
      <SMAA />
      <ComposerPixelRatio />
    </EffectComposer>
  );
}
