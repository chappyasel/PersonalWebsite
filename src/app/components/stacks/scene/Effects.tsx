"use client";

// Desktop-only postprocessing (audit §2.1, verified against installed
// source). Ground rules that keep this correct:
// - NEVER pass enabled={false}: a mounted-disabled composer pins the
//   renderer to NoToneMapping and blows out the frame. StacksCanvas mounts
//   and unmounts this component instead, in lockstep with the dpr ladder
//   (N8AO × adaptive-dpr is a known-bad pair).
// - multisampling={0}: SMAA owns the composer's offscreen target; the base
//   canvas still requests hardware MSAA so the performance ladder retains an
//   antialiasing floor when it unmounts this composer. MSAA render targets
//   corrupt on iOS anyway — touch devices never download this module at all.
// - ToneMapping mode is ACES explicitly — the effect DEFAULTS TO AGX, and
//   the mode enum must come from `postprocessing` (not re-exported).
//   Exposure parity with the composer-off path is automatic: three binds
//   renderer.toneMappingExposure into any program that declares it.
// - Noise replaces the sky's IGN dither (gated off via uPost) — dithering
//   linear HDR would grain the midtones; output-space noise is film grain.
import { useFrame } from "@react-three/fiber";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  N8AO,
  Noise,
  SMAA,
  TiltShift2,
  ToneMapping,
  Vignette,
  useDispose,
} from "@react-three/postprocessing";
import { BlendFunction, Effect, ToneMappingMode } from "postprocessing";
import { useMemo } from "react";
import { MathUtils, Uniform } from "three";

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
// into the existing Vignette/ToneMapping/Noise EffectPass — no extra pass.
const GRADE_FRAGMENT = `
  uniform float uDark; // 0 light … 1 dark, damped in lockstep with the sky

  float lumc(const in vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 d = pow(max(inputColor.rgb, 0.0), vec3(0.4545454545));

    d = mix(d, d * d * (3.0 - 2.0 * d), mix(0.13, 0.10, uDark));

    float l = lumc(d);
    float toe = 8.0 * l * max(0.0, 1.0 - 2.0 * l);
    vec3 toeHue = mix(vec3(1.00, 0.82, 0.60), vec3(0.50, 0.66, 1.00), uDark);
    d += toeHue * toe * mix(0.030, 0.032, uDark);

    l = lumc(d);
    vec3 keyHue = mix(vec3(1.012, 1.000, 0.978), vec3(1.016, 0.998, 0.968), uDark);
    d *= mix(vec3(1.0), keyHue, smoothstep(0.40, 0.95, l));

    l = lumc(d);
    float band = smoothstep(0.30, 0.70, l) * (1.0 - smoothstep(0.84, 1.00, l));
    float sat = 1.05 + mix(0.22, 0.16, uDark) * band;
    d = max(vec3(0.0), vec3(l) + (d - vec3(l)) * sat);

    outputColor = vec4(pow(d, vec3(2.2)), inputColor.a);
  }
`;

class GradeEffect extends Effect {
  constructor(dark: number) {
    super("GradeEffect", GRADE_FRAGMENT, {
      // SRC returns the shader's own output verbatim — a grade replaces the
      // frame, it does not composite over it.
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([["uDark", new Uniform(dark)]]),
    });
  }
}

function Grade({ dark }: { dark: boolean }) {
  // Seeded from the mounted theme so a dark first paint never ramps up from
  // the light grade; after that uDark damps at the sky dome's rate, so the
  // grade and the sky cross the theme flip together.
  const effect = useMemo(() => new GradeEffect(dark ? 1 : 0), []); // eslint-disable-line react-hooks/exhaustive-deps
  useDispose(effect);
  useFrame((_, delta) => {
    const u = effect.uniforms.get("uDark")!;
    u.value = MathUtils.damp(u.value as number, dark ? 1 : 0, 3.5, delta);
  });
  return <primitive object={effect} dispose={null} />;
}

export default function Effects({ dark }: { dark: boolean }) {
  // Two softness treatments, independently escapable for A/B links:
  // TiltShift2 is the owner-approved side blur (browse 2026-08-09) that
  // v8's DoF displaced — its loss was called out at the next browse and it
  // is now restored; DepthOfField is the real depth-driven bokeh that
  // replaced it. ?notiltshift and ?nodof each kill exactly one.
  const tiltShift = useMemo(
    () =>
      typeof window === "undefined" ||
      !window.location.search.includes("notiltshift"),
    [],
  );
  const depthOfField = useMemo(
    () =>
      typeof window === "undefined" ||
      !window.location.search.includes("nodof"),
    [],
  );
  const graded = useMemo(
    () =>
      typeof window === "undefined" ||
      !window.location.search.includes("nograde"),
    [],
  );
  return (
    <EffectComposer multisampling={0}>
      <N8AO
        halfRes
        quality="low"
        aoRadius={0.32}
        distanceFalloff={0.8}
        intensity={2.4}
      />
      {/* Keep bloom on HDR practicals, not on the moon and white sky detail.
          The floor-lamp mouth and fixture faces are deliberately authored
          above 1.0; the dome is not. A higher threshold therefore gives the
          practicals room for a stronger optical shoulder without laying a
          global haze over the skyline. */}
      <Bloom
        mipmapBlur
        luminanceThreshold={dark ? 1.25 : 1.35}
        luminanceSmoothing={0.08}
        intensity={dark ? 1.2 : 0.4}
      />
      {/* Camera→shelf distance is 5.8–6.4 world units across the alternating
          unit poses. A 2.6-unit focus range leaves held props and both shelf
          planes crisp, then rolls into optical bokeh toward the far skyline.
          This composer is already desktop-only and unmounts at the first
          performance decline, so mobile/degraded paths pay nothing. */}
      {depthOfField && (
        <DepthOfField
          focusDistance={6.05}
          focusRange={2.6}
          bokehScale={1.25}
          resolutionScale={0.5}
        />
      )}
      {/* The side blur: a vertical focus line with blur growing toward the
          left/right screen edges — the frame vignettes into softness the way
          a tilt-shift photo does, independent of scene depth. Values are the
          last shipped ones (removed in 710610c when DoF took this slot; the
          owner asked for it back). Vignette offset 0.34 below is the value
          this was originally tuned against. */}
      {tiltShift && <TiltShift2 blur={0.105} taper={0.6} />}
      {/* Light theme eases both finishing touches: premultiplied noise
          scales with luminance (a near-white sky grains hard), and dark
          corners read as grime against it. */}
      <Vignette eskil={false} offset={0.34} darkness={dark ? 0.5 : 0.3} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {graded && <Grade dark={dark} />}
      <Noise premultiply opacity={dark ? 0.22 : 0.07} />
      <SMAA />
    </EffectComposer>
  );
}
