"use client";

// Desktop-only postprocessing (audit §2.1, verified against installed
// source). Ground rules that keep this correct:
// - NEVER pass enabled={false}: a mounted-disabled composer pins the
//   renderer to NoToneMapping and blows out the frame. StacksCanvas mounts
//   and unmounts this component instead, in lockstep with the dpr ladder
//   (N8AO × adaptive-dpr is a known-bad pair).
// - multisampling={0}: SMAA replaces MSAA (gl.antialias is false on the
//   desktop path), and MSAA render targets corrupt on iOS anyway — though
//   touch devices never download this module at all.
// - ToneMapping mode is ACES explicitly — the effect DEFAULTS TO AGX, and
//   the mode enum must come from `postprocessing` (not re-exported).
//   Exposure parity with the composer-off path is automatic: three binds
//   renderer.toneMappingExposure into any program that declares it.
// - Noise replaces the sky's IGN dither (gated off via uPost) — dithering
//   linear HDR would grain the midtones; output-space noise is film grain.
import {
  Bloom,
  EffectComposer,
  N8AO,
  Noise,
  SMAA,
  TiltShift2,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useMemo } from "react";

export default function Effects({ dark }: { dark: boolean }) {
  // Prototype-only miniature look — a strong stylistic commitment, judged
  // by the owner at browse (?tiltshift), never shipped on by default.
  const tiltShift = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.location.search.includes("tiltshift"),
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
      <Bloom mipmapBlur luminanceThreshold={0.95} intensity={0.4} />
      {tiltShift && <TiltShift2 blur={0.12} />}
      {/* Light theme eases both finishing touches: premultiplied noise
          scales with luminance (a near-white sky grains hard), and dark
          corners read as grime against it. */}
      <Vignette eskil={false} offset={0.28} darkness={dark ? 0.5 : 0.3} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply opacity={dark ? 0.22 : 0.07} />
      <SMAA />
    </EffectComposer>
  );
}
