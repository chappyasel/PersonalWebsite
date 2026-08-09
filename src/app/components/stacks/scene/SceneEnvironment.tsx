"use client";

// Atmosphere for The Stacks — gradient sky dome, fog-matched palette,
// hemisphere fill, camera-tracking key light with soft shadows, and dust.
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { PALETTES, type Palette, rand } from "../theme";
import { progressRef } from "../store";
import { MID_X, TRAVEL_X } from "./worldLayout";

// Chappy's morning, painted truthfully. Dark theme is 3:45am San Francisco —
// fully dark, cold indigo, the city mostly asleep; light theme is just after
// first light. One ShaderMaterial for both: `uDark` crossfades the palettes
// (damped, no recompile), `uDawn` advances the morning with the traverse
// (scroll-tied and reversible), and an analytic skyline — hashed roofline,
// sparse windows, Sutro Tower's tripod, one downtown spike — sits low on the
// horizon with its own haze term (the dome opts out of scene fog).
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

    if (uSimplify < 0.5) {
      // Ember / low sun, azimuth-anchored near the end of the traverse so
      // travel pans toward it. Dark: grows from nothing (3:45 is fully dark)
      // to a first ember. Light: an always-warm glow that climbs as uDawn
      // rises, plus a whisper of horizon warmth everywhere.
      // pow() with a negative base is undefined in GLSL ES — square explicitly.
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
      float starGate = uDark * (1.0 - 0.35 * uDawn) * smoothstep(0.03, 0.22, e);
      if (starGate > 0.001) {
        vec2 sc = vec2(a * 34.0, e * 34.0);
        vec2 cell = floor(sc);
        float present = step(hash2(cell), 0.22);
        vec2 pos = vec2(hash2(cell + 17.0), hash2(cell + 43.0)) * 0.7 + 0.15;
        float d = length(fract(sc) - pos);
        float core = smoothstep(0.10, 0.02, d);
        float tw = 0.75 + 0.25 * sin(uTime * (0.6 + hash2(cell + 71.0) * 1.6) + hash2(cell + 5.0) * 6.28);
        float bright = 0.35 + 0.65 * hash2(cell + 29.0);
        col += vec3(0.82, 0.88, 1.0) * present * core * tw * bright * starGate;
      }

      // City silhouette: hashed roofline kept low on the horizon.
      float colId = floor(a * 64.0);
      float roof = 0.012 + hash1(colId) * 0.045;
      float city = 1.0 - smoothstep(roof - 0.0015, roof + 0.0015, e);
      // Sutro Tower — two legs to a waist, then three prongs.
      float sutro = 0.0;
      float dA = a + 1.65;
      if (abs(dA) < 0.05 && e < 0.095) {
        float legSpread = mix(0.011, 0.0035, clamp(e / 0.05, 0.0, 1.0));
        float legs = step(abs(abs(dA) - legSpread), 0.0016) * step(e, 0.055);
        float prongs = (step(abs(dA), 0.0014) + step(abs(abs(dA) - 0.0075), 0.0013)) * step(0.03, e) * step(e, 0.088);
        float waist = step(abs(e - 0.052), 0.0016) * step(abs(dA), 0.009);
        sutro = clamp(legs + prongs + waist, 0.0, 1.0);
      }
      // One downtown spike — thin tapering triangle.
      float spike = step(abs(a + 2.2), 0.012 * (1.0 - e / 0.075)) * step(-0.01, e);
      city = clamp(city + sutro + spike, 0.0, 1.0) * smoothstep(-0.10, -0.02, e);

      // Sparse warm window glints — the city is mostly asleep. Light theme
      // winks them out as the morning advances; dark wakes a few more.
      vec2 wc = vec2(a * 420.0, e * 300.0);
      vec2 wf = fract(wc);
      float inBox = step(abs(wf.x - 0.5), 0.22) * step(abs(wf.y - 0.45), 0.28);
      float lit = step(hash2(floor(wc)), 0.05 * mix(1.0 - 0.7 * uDawn, 1.0 + 0.6 * uDawn, uDark)) * inBox;
      float winMask = lit * city * step(0.004, e) * step(e, roof - 0.005) * (1.0 - sutro);

      // The silhouette dissolves toward the horizon band near the horizon
      // line — its own aerial haze; rooftops catch a kiss of the ember.
      float hazeAmt = (1.0 - smoothstep(0.0, 0.055, e)) * mix(0.75, 0.35, uDark);
      vec3 cityCol = mix(cityC, horizonC, hazeAmt);
      cityCol += emberC * ember * 0.25;
      cityCol = mix(cityCol, windowC, winMask * mix(0.45, 0.70, uDark));
      col = mix(col, cityCol, city);
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
      <pointsMaterial
        size={0.032}
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
