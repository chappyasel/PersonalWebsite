"use client";

// Atmosphere for The Stacks — gradient sky dome, fog-matched palette,
// hemisphere fill, camera-tracking key light with soft shadows, and dust.
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { PALETTES, type Palette, rand } from "../theme";
import { progressRef } from "../store";
import { poolTexture } from "./GroundPool";
import { MID_X, TRAVEL_X } from "./worldLayout";

// Chappy's morning, painted truthfully. Dark theme is 3:45am San Francisco —
// fully dark, cold indigo, the city mostly asleep; light theme is just after
// first light. One ShaderMaterial for both: `uDark` crossfades the palettes
// (damped, no recompile), `uDawn` advances the morning with the traverse
// (scroll-tied and reversible), and a compass-true analytic skyline sits low
// on the horizon with its own haze term (the dome opts out of scene fog).
//
// Left→right the traverse pans the real east-facing view: Twin Peaks /
// Mt Davidson → Sutro Tower on its hill → Coit on Telegraph Hill →
// Transamerica → the downtown cluster → Salesforce Tower → the ember →
// Bay Bridge with the Bay Lights. Truthful details: the Salesforce crown is
// DARK at 3:45 (Day for Night runs dusk→2am) — it gets the FAA L-864 beacon
// and catches the first ember before anything else in the city; the Bay
// Lights run dusk-until-dawn, so they are the one landmark alive all night.
//
// The dome must also run the same tonemapping + colorspace encode as every
// lit material — without those includes the authored hexes never reach the
// screen. IGN dither in output space breaks up gradient banding.
const SKY_VERTEX = `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = `
  uniform float uDark;     // 0 light theme … 1 dark theme (damped crossfade)
  uniform float uDawn;     // scroll offset 0…1 — the traverse advances the morning
  uniform float uTime;
  uniform float uFrame;    // frame counter mod 64 — scrolls the IGN dither
  uniform float uSimplify; // degrade rung: 1 = two bands, no city/stars/ember
  uniform vec3 zenithL;  uniform vec3 zenithD;
  uniform vec3 horizonL; uniform vec3 horizonD;
  uniform vec3 shadowL;  uniform vec3 shadowD;
  uniform vec3 emberL;   uniform vec3 emberD;
  uniform vec3 cityL;    uniform vec3 cityD;
  uniform vec3 windowL;  uniform vec3 windowD;
  varying vec3 vLocal;

  // Hoskins hash-without-sine — fract(sin(x)*43758) bands or degenerates on
  // some mobile GPU drivers.
  float hash1(float n) {
    n = fract(n * 0.1031);
    n *= n + 33.33;
    n *= n + n;
    return fract(n);
  }
  float hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  // Smooth dome profile for hills — quartic falloff, zero outside |a-c| > w.
  float hump(float a, float c, float w) {
    float q = (a - c) / w;
    float m = max(1.0 - q * q, 0.0);
    return m * m;
  }

  void main() {
    vec3 dir = normalize(vLocal);
    float e = dir.y;               // elevation: 0 at the horizon ring
    float a = atan(dir.z, dir.x);  // azimuth: traverse pans ~[-2.3, -0.9]

    vec3 zenithC  = mix(zenithL, zenithD, uDark);
    vec3 horizonC = mix(horizonL, horizonD, uDark);
    vec3 shadowC  = mix(shadowL, shadowD, uDark);
    vec3 emberC   = mix(emberL, emberD, uDark);
    vec3 cityC    = mix(cityL, cityD, uDark);
    vec3 windowC  = mix(windowL, windowD, uDark);

    // Three-band, non-monotonic: shadow band AT the horizon, the brighter
    // slate band above it (the inversion that reads "sky", not "gradient"),
    // then the fall to zenith. Below the horizon the void deepens — hard in
    // the dark theme so the floor grounds, gently in light.
    vec3 col = mix(shadowC, horizonC, smoothstep(0.0, 0.16, e));
    col = mix(col, zenithC, smoothstep(0.08, 0.45, e));
    col = mix(col, shadowC * mix(0.88, 0.45, uDark), smoothstep(0.02, 0.30, -e));

    // Ember / low sun, azimuth-anchored near the end of the traverse so
    // travel pans toward it. Dark: grows from nothing (3:45 is fully dark)
    // to a first ember. Light: an always-warm glow that climbs as uDawn
    // rises, plus a whisper of horizon warmth everywhere. The degrade ladder
    // keeps the dawn — pow() with a negative base is undefined in GLSL ES,
    // so the gaussians square explicitly.
    float qa = (a + 1.15) / mix(0.42, 0.28, uDark);
    float azFall = exp(-(qa * qa));
    float emberElev = mix(0.030 + 0.10 * uDawn, 0.020, uDark);
    float emberW = mix(0.055, 0.020 + 0.015 * uDawn, uDark);
    float emberAmp = mix(0.38 + 0.12 * uDawn, 0.30 * uDawn, uDark);
    float qe = (e - emberElev) / emberW;
    float ember = exp(-(qe * qe)) * emberAmp * azFall;
    float qg = (e - 0.02) / 0.04;
    ember += (1.0 - uDark) * 0.10 * exp(-(qg * qg));
    col += emberC * ember;

    // Stars, dark only — hashed cells in azimuth/elevation space with
    // per-star phase and rate, horizon extinction, thinned by the dawn.
    // Simplified halves the field instead of dropping it.
    float starGate = uDark * (1.0 - 0.35 * uDawn) * smoothstep(0.03, 0.22, e);
    if (starGate > 0.001) {
      vec2 sc = vec2(a * 34.0, e * 34.0);
      vec2 cell = floor(sc);
      float present = step(hash2(cell), 0.22 * (1.0 - 0.5 * uSimplify));
      vec2 pos = vec2(hash2(cell + 17.0), hash2(cell + 43.0)) * 0.7 + 0.15;
      float d = length(fract(sc) - pos);
      float core = smoothstep(0.10, 0.02, d);
      float tw = 0.75 + 0.25 * sin(uTime * (0.6 + hash2(cell + 71.0) * 1.6) + hash2(cell + 5.0) * 6.28);
      float bright = 0.35 + 0.65 * hash2(cell + 29.0);
      col += vec3(0.82, 0.88, 1.0) * present * core * tw * bright * starGate;
    }

    // ---- The city. Bimodal roofline — a flat residential carpet with one
    // tight downtown cluster punching out — is SF's actual silhouette
    // signature; a uniform hashed roofline is the generic-city shape.
    float colId = floor(a * 64.0);
    float dtown = smoothstep(0.42, 0.10, abs(a + 1.35));
    float roof = 0.012 + hash1(colId) * (0.016 + 0.042 * dtown);
    float city = 1.0 - smoothstep(roof - 0.0015, roof + 0.0015, e);

    // Twin Peaks / Mt Davidson + Telegraph Hill — hazier and flatter than
    // the buildings, their east flanks catch the first light.
    float hillA = 0.032 * hump(a, -2.16, 0.28);
    float hillB = 0.020 * hump(a, -1.98, 0.22);
    float telegraph = 0.018 * hump(a, -1.90, 0.065);
    float hillH = max(hillA, max(hillB, telegraph));
    float hillMask = (1.0 - smoothstep(hillH - 0.002, hillH + 0.002, e)) * step(0.0005, hillH);

    // Sutro Tower ON its hill (tip 0.118 — the true tallest, 1,811 ft ASL):
    // two legs to a waist, then three prongs, lifted by the hill base.
    float sutro = 0.0;
    float dSut = a + 2.20;
    float eh = e - 0.030;
    if (abs(dSut) < 0.05 && eh < 0.095 && eh > -0.02) {
      float legSpread = mix(0.011, 0.0035, clamp(eh / 0.05, 0.0, 1.0));
      float legs = step(abs(abs(dSut) - legSpread), 0.0016) * step(eh, 0.055);
      float prongs = (step(abs(dSut), 0.0014) + step(abs(abs(dSut) - 0.0075), 0.0013)) * step(0.03, eh) * step(eh, 0.088);
      float waist = step(abs(eh - 0.052), 0.0016) * step(abs(dSut), 0.009);
      sutro = clamp(legs + prongs + waist, 0.0, 1.0);
    }

    // Coit Tower on Telegraph Hill — slender shaft, gently flared arcade.
    // Silhouette only (nightly floodlighting is unverified).
    float coit = 0.0;
    if (uSimplify < 0.5) {
      float dCoit = a + 1.90;
      if (abs(dCoit) < 0.008 && e < 0.048) {
        float shaft = step(abs(dCoit), 0.0032) * step(0.010, e) * step(e, 0.040);
        float cap = step(abs(dCoit), 0.0046) * step(0.040, e) * step(e, 0.046);
        coit = max(shaft, cap);
      }
    }

    // Transamerica Pyramid — tapering triangle plus the two vertical wings
    // (they are what turn "a triangle" into THE pyramid).
    float trans = 0.0;
    float dTr = a + 1.62;
    if (abs(dTr) < 0.014 && e < 0.084) {
      float hwT = 0.0102 * (1.0 - e / 0.082);
      trans = step(abs(dTr), max(hwT, 0.0008)) * step(e, 0.082);
      float wings = step(abs(abs(dTr) - 0.0102), 0.0012) * step(e, 0.050);
      trans = max(trans, wings);
    }

    // Salesforce Tower — obelisk taper with the crown DISSOLVING over the
    // top 14% (Pelli's stated intent). Dark at 3:45: Day for Night runs
    // dusk→2am, so the crown earns a beacon, not a light show.
    float sales = 0.0;
    float crownT = 0.0;
    float dSf = a + 1.28;
    float sTop = 0.100;
    if (abs(dSf) < 0.012 && e < sTop + 0.004) {
      float hwS = mix(0.0092, 0.0034, clamp(e / sTop, 0.0, 1.0));
      float dissolve = smoothstep(sTop, sTop - 0.014, e);
      sales = step(abs(dSf), hwS) * dissolve * step(e, sTop);
      crownT = clamp(e / sTop, 0.0, 1.0);
    }

    // Bay Bridge west span — parabola cable (the correct curve for a loaded
    // suspension deck), two towers, and the Bay Lights strung on the cable.
    // −1.09 rather than the surveyed −1.02: at −1.02 the whole span hides
    // behind the Systems shelf props at unit 6 on desktop. −1.09 keeps the
    // compass order (east of Salesforce) and hangs the cables in front of
    // the ember glow.
    float bridge = 0.0;
    float bayLight = 0.0;
    float bx = (a + 1.09) / 0.055;
    if (abs(bx) < 1.15 && e < 0.036) {
      float towers = step(abs(abs(bx) - 1.0), 0.05) * step(0.002, e) * step(e, 0.030);
      float deck = step(abs(e - 0.0075), 0.0018) * step(abs(bx), 1.06);
      float cableE = 0.009 + 0.021 * bx * bx;
      float onSpan = step(abs(bx), 1.0);
      float cable = step(abs(e - cableE), 0.0012) * onSpan;
      bridge = clamp(towers + deck + cable, 0.0, 1.0);
      // Bay Lights 360 (relit 2026-03-20, dusk until dawn): dot sequencing
      // via a nested-sin phase warp — algorithmic, never marquee. Simplified
      // keeps a static dim string.
      float s = (bx + 1.0) * 12.0;
      float dotId = floor(s);
      float seq = 0.5;
      if (uSimplify < 0.5) {
        seq = 0.35 + 0.65 * (0.5 + 0.5 * sin(dotId * 1.7 + sin(dotId * 0.37 + uTime * 0.31) + uTime * 0.5));
      }
      float dotMask = step(abs(fract(s) - 0.5), 0.24) * step(abs(e - cableE), 0.0022) * onSpan;
      bayLight = dotMask * seq;
    }

    float ground = smoothstep(-0.10, -0.02, e);
    float structures = clamp(city + sutro + coit + trans + sales + bridge, 0.0, 1.0) * ground;
    hillMask *= ground;

    // Sparse warm window glints — the city is mostly asleep. Scrolling
    // re-deals which windows are lit (uDawn folds into the hash); light
    // theme winks them out as the morning advances, dark wakes a few more.
    vec2 wc = vec2(a * 420.0, e * 300.0);
    vec2 wf = fract(wc);
    float inBox = step(abs(wf.x - 0.5), 0.22) * step(abs(wf.y - 0.45), 0.28);
    float shift = 0.0;
    if (uSimplify < 0.5) shift = floor(uDawn * 6.0);
    float lit = step(hash2(floor(wc) + shift), 0.05 * mix(1.0 - 0.7 * uDawn, 1.0 + 0.6 * uDawn, uDark)) * inBox;
    float winMask = lit * city * step(0.004, e) * step(e, roof - 0.005) * (1.0 - sutro);

    // The silhouette dissolves toward the horizon band near the horizon
    // line — its own aerial haze; rooftops catch a kiss of the ember.
    float hazeAmt = (1.0 - smoothstep(0.0, 0.055, e)) * mix(0.75, 0.35, uDark);
    vec3 hillCol = mix(cityC, horizonC, clamp(hazeAmt + mix(0.26, 0.35, uDark), 0.0, 1.0));
    hillCol += emberC * 0.55 * emberAmp * smoothstep(-2.16, -1.95, a);
    vec3 cityCol = mix(cityC, horizonC, hazeAmt);
    cityCol += emberC * ember * 0.25;
    // The crown catches the first ember before anything else in the city —
    // tallest, east-facing glass. Salesforce Tower announces the dawn.
    cityCol += emberC * smoothstep(0.55, 1.0, crownT) * ember * 2.5 * sales;
    cityCol = mix(cityCol, windowC, winMask * mix(0.45, 0.70, uDark));

    col = mix(col, hillCol, hillMask);
    col = mix(col, cityCol, structures);
    col += windowC * bayLight * uDark * (1.0 - 0.8 * smoothstep(0.4, 1.0, uDawn)) * 0.85;

    if (uSimplify < 0.5) {
      // Mist — three incommensurate azimuth sines, drift at cinema speed.
      // Dark: a thin cold inversion veiling the building bases. Light: Karl,
      // tallest and densest over the hills, thinning eastward.
      float m = 0.5 + 0.1667 * (sin(a * 3.1 + uTime * 0.021) + sin(a * 7.3 - uTime * 0.013) + sin(a * 13.7 + uTime * 0.017));
      float baseBand = smoothstep(0.020, 0.004, e) * step(-0.004, e);
      col = mix(col, mix(horizonC, zenithC, 0.35), baseBand * m * structures * 0.5 * uDark);
      float west = smoothstep(-1.75, -2.15, a);
      float karlBand = smoothstep(0.075, 0.014, e) * step(-0.01, e);
      float karl = karlBand * (0.15 + 0.85 * west) * (0.45 + 0.55 * m) * (1.0 - uDark);
      col = mix(col, mix(horizonC, vec3(0.97, 0.985, 1.0), 0.50), karl * 0.68);

      // Aviation lights, dark only. Salesforce: FAA L-864 red at the
      // regulation 30 flashes/min, short duty. Transamerica: steady red apex
      // (the Crown Jewel is holiday-only). Bridge towers: out of phase.
      vec3 avRed = vec3(0.90, 0.12, 0.10);
      float night = smoothstep(0.35, 0.75, uDark);
      float sfFlash = step(fract(uTime * 0.5), 0.14);
      float dBeac = length(vec2(dSf, e - sTop));
      col += avRed * smoothstep(0.0040, 0.0012, dBeac) * sfFlash * night;
      float dApex = length(vec2(dTr, e - 0.082));
      col += avRed * smoothstep(0.0032, 0.0010, dApex) * 0.8 * night;
      float dT1 = length(vec2(a + 1.145, e - 0.030));
      float dT2 = length(vec2(a + 1.035, e - 0.030));
      col += avRed * (smoothstep(0.0030, 0.0010, dT1) * step(fract(uTime * 0.5 + 0.37), 0.14)
                    + smoothstep(0.0030, 0.0010, dT2) * step(fract(uTime * 0.5 + 0.71), 0.14)) * night;

      // Dim-shimmer crown (dark only) — a scrolling band with a ~60s hue
      // drift, peak clamped to ≤0.35× the ember amplitude so it reads as a
      // memory of Day for Night, not a light show.
      float band = 0.5 + 0.5 * sin(e * 240.0 - uTime * 0.7);
      vec3 crownHue = mix(vec3(0.72, 0.62, 0.55), 0.5 + 0.5 * cos(uTime * 0.105 + vec3(0.0, 2.09, 4.19)), 0.40);
      col += crownHue * band * smoothstep(0.68, 0.94, crownT) * sales * 0.060 * night;

      // Satellite — one dim, tailless, constant-velocity crossing every 92s
      // (Starlink-era truthful; the sophisticated cousin of a shooting
      // star). uTime-only gate is frame-uniform, so idle cost is nil. The
      // +84 seed lands the first pass ~8s after mount.
      float satT = mod(uTime + 84.0, 92.0);
      if (satT < 5.5) {
        float passId = floor((uTime + 84.0) / 92.0);
        float t01 = satT / 5.5;
        // e 0.10-0.17: the visible frame only reaches e ≈ 0.20 at desktop
        // aspect — anything higher crosses above the viewport unseen.
        vec2 sat = vec2(
          -2.35 + hash1(passId + 0.5) * 0.45 + 1.15 * t01,
          0.10 + hash1(passId + 7.3) * 0.07 + (hash1(passId + 13.7) - 0.5) * 0.05 * t01
        );
        float dSat = length(vec2(a, e) - sat);
        col += vec3(0.80, 0.85, 0.95) * smoothstep(0.0020, 0.0006, dSat) * 0.55 * night * (1.0 - 0.5 * uDawn);
      }
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Temporal IGN (Jimenez scroll folded into the fract) with the amplitude
    // shaped to the midtones — pure dither in the deep end, film grain where
    // the eye can actually resolve it.
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)) + uFrame * 0.4076492));
    float lum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float amp = 2.0 / 255.0 + (5.0 / 255.0) * (1.0 - abs(lum * 2.0 - 1.0));
    gl_FragColor.rgb += (n - 0.5) * amp;
  }
`;

function SkyDome({ dark, simplify }: { dark: boolean; simplify: boolean }) {
  const material = useMemo(() => {
    const c = (hex: string) => new THREE.Color(hex);
    const L = PALETTES.light;
    const D = PALETTES.dark;
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uDark: { value: dark ? 1 : 0 },
        uDawn: { value: 0 },
        uTime: { value: 0 },
        uFrame: { value: 0 },
        uSimplify: { value: 0 },
        zenithL: { value: c(L.skyTop) },
        zenithD: { value: c(D.skyTop) },
        horizonL: { value: c(L.skyHorizon) },
        horizonD: { value: c(D.skyHorizon) },
        shadowL: { value: c(L.skyShadow) },
        shadowD: { value: c(D.skyShadow) },
        emberL: { value: c(L.skyEmber) },
        emberD: { value: c(D.skyEmber) },
        cityL: { value: c(L.skyline) },
        cityD: { value: c(D.skyline) },
        windowL: { value: c(L.skyWindow) },
        windowD: { value: c(D.skyWindow) },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
    });
    // The material lives for the mount — theme flips crossfade via uDark.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }, delta) => {
    const u = material.uniforms;
    u.uDark!.value = THREE.MathUtils.damp(
      u.uDark!.value as number,
      dark ? 1 : 0,
      3.5,
      delta,
    );
    u.uDawn!.value = progressRef.current;
    u.uTime!.value = clock.elapsedTime;
    u.uFrame!.value = ((u.uFrame!.value as number) + 1) % 64;
    u.uSimplify!.value = simplify ? 1 : 0;
  });
  // renderOrder 1: draw after opaque geometry so early-Z rejects the covered
  // sky fragments (its depth-sort position otherwise changes during traverse).
  return (
    <mesh position={[MID_X, 0, 0]} material={material} renderOrder={1}>
      <sphereGeometry args={[34, 32, 24]} />
    </mesh>
  );
}

// Image-based lighting from hand-placed emitters — no HDRI file, no CDN.
// Gives the 37 standard materials something to reflect; intensity stays low
// so the lamps keep reading as the light source.
function RoomEnvironment({ dark }: { dark: boolean }) {
  return (
    <Environment
      frames={1}
      resolution={256}
      environmentIntensity={dark ? 0.45 : 0.38}
    >
      <Lightformer
        form="rect"
        color={dark ? "#ffc98f" : "#ffd9b0"}
        intensity={dark ? 1.5 : 1.8}
        position={[4, 3, 4]}
        scale={10}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        color={dark ? "#42506b" : "#6e7f95"}
        intensity={dark ? 1.3 : 0.7}
        position={[-5, 2, 1]}
        scale={8}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="circle"
        color={dark ? "#5b432c" : "#a97e54"}
        intensity={0.5}
        position={[0, -4, 2]}
        scale={8}
        target={[0, 0, 0]}
      />
    </Environment>
  );
}

function Dust({ palette, count = 380 }: { palette: Palette; count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = -2 + rand(i, 21) * (TRAVEL_X + 4);
      arr[i * 3 + 1] = -1.3 + rand(i, 22) * 3.1;
      arr[i * 3 + 2] = -2.2 + rand(i, 23) * 3.4;
    }
    return arr;
  }, [count]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 0.18) * 0.07;
    ref.current.position.x = Math.sin(t * 0.11) * 0.1;
  });
  return (
    <points ref={ref}>
      <bufferGeometry key={count}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      {/* Soft radial sprite map — untextured Points rasterize as 1-2px hard
          white squares against dark wood (audit §1.7). */}
      <pointsMaterial
        map={poolTexture()}
        size={0.04}
        color={palette.dust}
        transparent
        opacity={palette.dustOpacity}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// Warm key light following the camera laterally so every unit reads the same.
// It doesn't cast — grounding comes from the analytic ground pools
// (GroundPool.tsx), so there is no per-frame shadow pass at all.
function KeyLight({ dark }: { dark: boolean }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.target.position.set(MID_X, -0.5, 0);
    scene.add(light.target);
    return () => {
      scene.remove(light.target);
    };
  }, [scene]);
  useFrame(({ camera }) => {
    const light = lightRef.current;
    if (!light) return;
    light.position.x = camera.position.x + 4;
    light.target.position.x = camera.position.x;
  });
  return (
    <directionalLight
      ref={lightRef}
      position={[4, 6.5, 6]}
      intensity={dark ? 1.15 : 1.35}
      color={dark ? "#e8b57e" : "#ffe9cb"}
    />
  );
}

export default function SceneEnvironment({
  palette,
  dark,
  dustOff,
  skySimplify,
}: {
  palette: Palette;
  dark: boolean;
  dustOff?: boolean;
  skySimplify?: boolean;
}) {
  return (
    <>
      <fog attach="fog" args={[palette.fog, 8, 24]} />
      <SkyDome dark={dark} simplify={!!skySimplify} />
      <RoomEnvironment key={dark ? "env-d" : "env-l"} dark={dark} />
      <hemisphereLight
        color={dark ? "#a8825c" : "#fff2df"}
        groundColor={dark ? "#2a1c10" : "#b08c66"}
        intensity={dark ? 0.95 : 1.05}
      />
      <KeyLight dark={dark} />
      {!dustOff && <Dust palette={palette} />}
    </>
  );
}
