"use client";

// The production depth-of-field lens. A physical circle of confusion plus
// depth-aware aperture gathering removes the old fill pass's skyline halo and
// turns small lights into coherent bokeh. The component name preserves the
// diagnostics experiment's internal model IDs.
import { useFrame, useThree } from "@react-three/fiber";
import { useDispose } from "@react-three/postprocessing";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { useMemo, useRef } from "react";
import { PerspectiveCamera, Uniform, Vector3 } from "three";

import { focusPull, focusPullTarget } from "./focusPull";
import type { OpticalDepthOfFieldTuning } from "./sceneQualityController";
import { SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS } from "./shelfDepthOfField";

export const OPTICAL_BOKEH_MATCHED_TAPS = 16;
export const OPTICAL_BOKEH_QUALITY_TAPS = 32;
export const OPTICAL_BOKEH_ULTRA_TAPS = 64;
export type OpticalBokehTapCount =
  | typeof OPTICAL_BOKEH_MATCHED_TAPS
  | typeof OPTICAL_BOKEH_QUALITY_TAPS
  | typeof OPTICAL_BOKEH_ULTRA_TAPS;

const GOLDEN_ANGLE = 2.399963229728653;

const apertureGatherFor = (tapCount: OpticalBokehTapCount) =>
  Array.from({ length: tapCount }, (_, index) => {
    const radius = Math.sqrt((index + 0.5) / tapCount);
    const angle = index * GOLDEN_ANGLE;
    const x = (Math.cos(angle) * radius).toFixed(7);
    const y = (Math.sin(angle) * radius).toFixed(7);
    return `opticalGather(vec2(${x}, ${y}), ${radius.toFixed(7)}, uv, centerSide, centerRadius, focusMm, thinLensScalePixels, highlightGainPerRadius, color, weight);`;
  }).join("\n    ");

export const opticalBokehFragmentFor = (tapCount: OpticalBokehTapCount) => `
  uniform float uFocusDistance;
  uniform float uFocusFalloff;
  uniform float uClearRadius;
  uniform float uFocalLengthMm;
  uniform float uFStop;
  uniform float uFilmHeightMm;
  uniform float uStrength;
  uniform float uMaxRadiusPixels;
  uniform float uHighlightThreshold;
  uniform float uHighlightGain;
  uniform float uEdgeSoftnessPixels;

  float opticalDistance(const in float depth) {
    return max(0.001, -getViewZ(depth));
  }

  float opticalRadiusPixels(
    const in float distance,
    const in float focusMm,
    const in float thinLensScalePixels
  ) {
    float delta = abs(distance - uFocusDistance);
    float authoredGate = smoothstep(
      uClearRadius,
      uClearRadius + max(0.001, uFocusFalloff),
      delta
    );
    if (authoredGate <= 0.0) return 0.0;

    // Thin-lens circle of confusion. The terms shared by every aperture tap
    // are calculated once in mainImage; each tap only evaluates |O-S| / O.
    float objectMm = max(distance * 1000.0, uFocalLengthMm + 0.001);
    float radiusPixels = thinLensScalePixels *
      abs(objectMm - focusMm) / objectMm;
    return min(uMaxRadiusPixels, radiusPixels * authoredGate * uStrength);
  }

  float opticalSide(const in float distance) {
    return distance < uFocusDistance ? -1.0 : 1.0;
  }

  void opticalGather(
    const in vec2 aperturePoint,
    const in float apertureRadius,
    const in vec2 uv,
    const in float centerSide,
    const in float centerRadius,
    const in float focusMm,
    const in float thinLensScalePixels,
    const in float highlightGainPerRadius,
    inout vec3 color,
    inout float weight
  ) {
    vec2 sampleUv = clamp(
      uv + aperturePoint * centerRadius * texelSize,
      texelSize * 0.5,
      vec2(1.0) - texelSize * 0.5
    );
    float sampleDepth = readDepth(sampleUv);
    float sampleDistance = opticalDistance(sampleDepth);
    float sampleSide = opticalSide(sampleDistance);

    // Samples may mix only on the same side of the focal plane. This keeps
    // pale sky from being gathered over a sharp or foreground silhouette,
    // which is the white contour produced by the current fill pass.
    float sameSide = step(0.0, centerSide * sampleSide);
    float sampleRadius = opticalRadiusPixels(
      sampleDistance,
      focusMm,
      thinLensScalePixels
    );
    float sampleOffset = apertureRadius * centerRadius;
    float coversPixel = smoothstep(
      sampleOffset - uEdgeSoftnessPixels,
      sampleOffset + uEdgeSoftnessPixels,
      sampleRadius
    );
    float sampleWeight = sameSide * coversPixel;
    if (sampleWeight <= 0.0) return;

    vec3 sampleColor = texture2D(inputBuffer, sampleUv).rgb;
    float luminance = dot(sampleColor, vec3(0.2126, 0.7152, 0.0722));
    float highlight = smoothstep(
      uHighlightThreshold,
      uHighlightThreshold + 0.5,
      luminance
    );
    float highlightScale = 1.0 + highlight * sampleRadius *
      highlightGainPerRadius;
    color += sampleColor * highlightScale * sampleWeight;
    weight += sampleWeight;
  }

  void mainImage(
    const in vec4 inputColor,
    const in vec2 uv,
    const in float depth,
    out vec4 outputColor
  ) {
    float centerDistance = opticalDistance(depth);
    if (abs(centerDistance - uFocusDistance) <= uClearRadius) {
      outputColor = inputColor;
      return;
    }

    float focusMm = max(
      uFocusDistance * 1000.0,
      uFocalLengthMm + 0.001
    );
    float thinLensScalePixels = 0.5 * uFocalLengthMm * uFocalLengthMm *
      resolution.y / (
        max(0.1, uFStop) *
        max(0.001, focusMm - uFocalLengthMm) *
        max(0.001, uFilmHeightMm)
      );
    float centerRadius = opticalRadiusPixels(
      centerDistance,
      focusMm,
      thinLensScalePixels
    );
    if (centerRadius < 0.35) {
      outputColor = inputColor;
      return;
    }

    float centerSide = opticalSide(centerDistance);
    float highlightGainPerRadius = uHighlightGain /
      max(1.0, uMaxRadiusPixels);
    vec3 color = inputColor.rgb;
    float weight = 1.0;
    ${apertureGatherFor(tapCount)}
    outputColor = vec4(color / max(1.0, weight), inputColor.a);
  }
`;

class OpticalBokehPrototypeEffect extends Effect {
  constructor(tapCount: OpticalBokehTapCount) {
    super(
      `OpticalBokehPrototype${tapCount}Effect`,
      opticalBokehFragmentFor(tapCount),
      {
        attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
        blendFunction: BlendFunction.SRC,
        uniforms: new Map([
          ["uFocusDistance", new Uniform(5.8)],
          ["uFocusFalloff", new Uniform(1.15)],
          ["uClearRadius", new Uniform(SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS)],
          ["uFocalLengthMm", new Uniform(40)],
          ["uFStop", new Uniform(1.8)],
          ["uFilmHeightMm", new Uniform(24)],
          ["uStrength", new Uniform(1)],
          ["uMaxRadiusPixels", new Uniform(20)],
          ["uHighlightThreshold", new Uniform(0.72)],
          ["uHighlightGain", new Uniform(1.15)],
          ["uEdgeSoftnessPixels", new Uniform(1)],
        ]),
      },
    );
  }
}

export function OpticalBokehPrototype({
  target,
  focusRange,
  bokehScale,
  taps,
  tuning,
}: {
  target: readonly [number, number, number];
  focusRange: number;
  bokehScale: number;
  taps: OpticalBokehTapCount;
  tuning: OpticalDepthOfFieldTuning;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const effect = useMemo(() => new OpticalBokehPrototypeEffect(taps), [taps]);
  const localTarget = useRef(new Vector3());
  useDispose(effect);

  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return;

    focusPullTarget(target, focusPull, localTarget.current).applyMatrix4(
      camera.matrixWorldInverse,
    );
    effect.uniforms.get("uFocusDistance")!.value = Math.max(
      0.001,
      -localTarget.current.z + tuning.focusDistanceOffset,
    );
    effect.uniforms.get("uFocusFalloff")!.value =
      focusRange * tuning.focusFalloffMultiplier;
    effect.uniforms.get("uClearRadius")!.value = tuning.focusClearRadius;
    effect.uniforms.get("uFocalLengthMm")!.value = camera.getFocalLength();
    effect.uniforms.get("uFilmHeightMm")!.value = camera.getFilmHeight();
    const dpr = Math.max(0.5, gl.getPixelRatio());
    effect.uniforms.get("uFStop")!.value = tuning.fStop;
    effect.uniforms.get("uStrength")!.value = Math.max(0.05, bokehScale / dpr);
    effect.uniforms.get("uMaxRadiusPixels")!.value = tuning.maxBlurRadius * dpr;
    effect.uniforms.get("uHighlightThreshold")!.value =
      tuning.highlightThreshold;
    effect.uniforms.get("uHighlightGain")!.value = tuning.highlightGain;
    effect.uniforms.get("uEdgeSoftnessPixels")!.value =
      tuning.edgeSoftness * dpr;
  });

  return <primitive object={effect} dispose={null} />;
}
