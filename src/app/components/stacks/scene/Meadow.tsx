"use client";

// The meadow below the horizon — a faithful port of Ebenezer's FluffyGrass
// recipe (MIT, https://github.com/thebenezer/FluffyGrass — the vendored
// grass-tuft.glb + alpha texture are his) onto this scene's verified field
// math. What makes it fluffy, learned the hard way after two failed
// original attempts: BIG overlapping multi-card tufts (not blades), a soft
// hand-authored multi-blade alpha texture (not procedural stripes), a
// near-black base under bright tips so overlap reads as pile depth, and a
// terrain painted in the same palette so coverage never breaks.
//
// Layout, fog, and degrade all come from meadowField.ts (pure, shared with
// vitest and scripts/stacks-meadow-check.ts); this file owns geometry
// prep, GLSL, and the per-frame uniform writes — nothing else runs per
// frame. Two grass draws (near lawn = detailed tuft LOD, mid+seated =
// light LOD) + terrain + flowers = four draw calls.
import { markMeadowReady } from "../loading";
import { progressRef } from "../store";
import { PALETTES } from "../theme";
import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { MEADOW_LAMP_MAX, getMeadowLamps } from "./meadowLights";
import {
  MEADOW_BANK,
  MEADOW_FLOWER_TOTAL,
  MEADOW_FOG,
  MEADOW_GROUND_BASE,
  MEADOW_RUNG_FLOWERS,
  MEADOW_RUNG_GRASS_FAR,
  MEADOW_RUNG_GRASS_NEAR,
  MEADOW_TERRAIN,
  buildFlowerPositions,
  buildGrassInstances,
  meadowHeight,
  shadeScale,
} from "./meadowField";
import { getSeatAmount } from "./seated";

const TUFT_URL = "/models/grass-tuft.glb";
const ALPHA_URL = "/images/stacks/grass-tuft-alpha.webp";

// Meadow-only colors — not PALETTES duplicates, so local hexes are
// legitimate. Light theme starts from FluffyGrass's palette, darkened 20%
// to deepen the lawn while preserving its dark-under-bright fluff layering;
// tip B gives patch-scale variation. Dark is the moonlit equivalent.
const COLORS = {
  baseL: "#273216",
  tipAL: "#7ca971",
  tipBL: "#25422c",
  baseD: "#0d1710",
  tipAD: "#3f5a49",
  tipBD: "#1d2c25",
  // Round 3 deepened A and B ("in general in light mode it's hard to see
  // them"): more chroma survives the fog mix and the pale lawn behind.
  flowerA: "#5b76d6", // cornflower blue, 55% (owner round 2)
  flowerB: "#e0862f", // poppy orange, 20%
  flowerC: "#ece0c6", // cream, 25%
  // Night heads: dim but SATURATED (round-3 third pass: "too bright and
  // not vibrant enough in dark mode") — moonlit cornflower and violet
  // rather than the old grey lavenders.
  nightA: "#6f79c8",
  nightB: "#a290c8",
} as const;

/** KeyLight's constant direction (eye-relative offset (4, 7, 6) — see
 * meadowField's bakedSun, which uses the same vector for tufts). */
const SUN_DIR = new THREE.Vector3(4, 7, 6).normalize();

// Flower quad, world units before instance scale.
const FLOWER_HW = 0.024;
const FLOWER_H = 0.048;

/** Pointer-poke support: hover is a fine-pointer idea — on touch the last
 * tap would leave a frozen dent in the lawn. Evaluated once (SSR-safe). */
const finePointer =
  typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
const pokeScratch = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Shared GLSL. Hoskins hash-without-sine (the SceneEnvironment idiom —
// fract(sin·43758) bands or degenerates on some mobile GPU drivers).
const NOISE_GLSL = /* glsl */ `
  float hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
               mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x),
               f.y);
  }
`;

// SimonDev-style two-scale traveling wind: a low-frequency direction field,
// then gust strength and fine breeze that march ALONG the wind so energy
// visibly travels downwind instead of shimmering in place. Gust is squared
// for a calm bias. Returns the lean in radians (XZ plane). uTime-based real
// seconds, never per-frame deltas — immune to the 120 Hz double-speed trap.
const WIND_GLSL = /* glsl */ `
  vec2 windAt(vec2 pos, float t) {
    float ang = (vnoise(pos * 0.035 + vec2(t * 0.025, 0.0)) - 0.5) * 1.2 - 2.35;
    vec2 dir = vec2(cos(ang), sin(ang));
    float gust = vnoise(pos * 0.22 - dir * (t * 0.55));
    gust *= gust;
    float breeze = vnoise(pos * 0.85 - dir * (t * 1.10));
    return dir * (uWindAmp * (0.35 + 0.85 * gust + 0.25 * breeze));
  }
`;

// The ONE fog story. Every meadow fragment converges on what the DOME
// actually renders at the fragment's own view elevation — the skyShadow
// palette crossfade × the dawn tint × the below-horizon darkening
// (SceneEnvironment:579-583, :607). This is the dark-theme edge fix: below
// the horizon the dome shows skyShadow-derived color, NOT palette.fog.
// Seated, the target slides to the Potomac's water color across the bank
// span, on the same uSeat clock the dome's own DC window rides — the ramp
// is interpolated from MEADOW_BANK so it reaches full dcWater by the skirt
// line and keeps tracking it when the bank is retuned.
const DOME_GLSL = /* glsl */ `
  vec3 domeBelow(vec3 worldPos) {
    vec3 shadowC = mix(uShadowL, uShadowD, uDark);
    shadowC *= (vec3(1.0) + vec3(0.050, 0.025, -0.018) * uDawn)
             * (1.0 + uDawn * mix(0.10, 0.17, uDark));
    float e = normalize(worldPos - cameraPosition).y;
    vec3 below = shadowC * mix(1.0, mix(0.88, 0.45, uDark), smoothstep(0.02, 0.30, -e));
    vec3 water = mix(uDcWaterL, uDcWaterD, uDark);
    return mix(below, water, uSeat * smoothstep(${(MEADOW_BANK.riseStartZ - 3).toFixed(1)}, ${(MEADOW_BANK.skirtZ - 1.1).toFixed(1)}, worldPos.z));
  }
`;

// The practicals' pools (meadowLights.ts). The grass is unlit by design, so
// the handful of registered ground-pooling lamps arrive as a fixed uniform
// array and an analytic radial pool — warm where the real SpotLight is
// bright, dark when its click-off egg is off (uLampGlow carries the same
// eased lit factor the glow sprites read). Evaluated per VERTEX (tuft
// origin / terrain vertex): the pools are metres wide, so vertex resolution
// is invisible and the fragment cost is one madd.
const LAMP_GLSL = /* glsl */ `
  uniform vec4 uLampPos[${MEADOW_LAMP_MAX}];
  uniform float uLampGlow[${MEADOW_LAMP_MAX}];
  float lampPool(vec3 p) {
    float g = 0.0;
    for (int i = 0; i < ${MEADOW_LAMP_MAX}; i++) {
      vec2 d = p.xz - uLampPos[i].xz;
      float fall = 1.0 - smoothstep(0.0, uLampPos[i].w, length(d));
      g += uLampGlow[i] * fall * fall;
    }
    return g;
  }
`;
/** The pool's warm hue — FloorLampSpot's #ffbe73 pushed slightly toward
 * amber so it stays lamp-colored after the grass's own green multiplies in. */
const LAMP_WARM = "vec3(1.0, 0.72, 0.44)";

const SHARED_UNIFORMS_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uDark;
  // Pointer poke: ground-plane hit under the cursor (.xy = world x/z),
  // radius (.z) and eased strength (.w). Tufts and flower heads lean away
  // from it — the lawn answers the pointer like the props do. uPokeF is
  // the FLOWERS' copy of the same signal, eased much more slowly (stems
  // bend and recover lazily where blades spring).
  uniform vec4 uPoke;
  uniform vec4 uPokeF;
  uniform float uDawn;
  uniform float uSeat;
  uniform float uWindAmp;
  uniform float uWindSpeed;
  uniform vec3 uShadowL;
  uniform vec3 uShadowD;
  uniform vec3 uDcWaterL;
  uniform vec3 uDcWaterD;
  uniform vec3 uBaseL;
  uniform vec3 uBaseD;
  uniform vec3 uTipAL;
  uniform vec3 uTipAD;
  uniform vec3 uTipBL;
  uniform vec3 uTipBD;
`;

// Fog ramps interpolated from meadowField so the shader and the headless
// check script cannot drift: grass saturates at 22, terrain at exactly the
// scene-fog far (24) — the instanced→terrain handoff maintains itself.
const GRASS_FOG = `smoothstep(${MEADOW_FOG.grass[0].toFixed(1)}, ${MEADOW_FOG.grass[1].toFixed(1)}, -mv.z)`;
const TERRAIN_FOG = `smoothstep(${MEADOW_FOG.terrain[0].toFixed(1)}, ${MEADOW_FOG.terrain[1].toFixed(1)}, -mv.z)`;

// The round-3 fog CAP (MEADOW_FOG.cap): the ramps above no longer converge
// all the way to the dome color in the open field — a theme-split residual
// of local color survives, which keeps the midfield green in light mode and
// lets the horizon ridge read as a grassy hill instead of a flat
// dome-colored wall. The residual is REVOKED (fog returns to 100%) past
// `capFade` view depth and inside the terrain rectangle's border bands, so
// every boundary edge still saturates and the check script's (a) edge
// contract stays exactly true at the borders.
const FOG_CAP_GLSL = /* glsl */ `
  float fogAmount(float ramp, vec3 wp, float d) {
    float cap = mix(${MEADOW_FOG.cap[0].toFixed(2)}, ${MEADOW_FOG.cap[1].toFixed(2)}, uDark);
    float recover = smoothstep(${MEADOW_FOG.capFade[0].toFixed(1)}, ${MEADOW_FOG.capFade[1].toFixed(1)}, d);
    recover = max(recover, smoothstep(${(MEADOW_TERRAIN.minX + MEADOW_FOG.border).toFixed(1)}, ${MEADOW_TERRAIN.minX.toFixed(1)}, wp.x));
    recover = max(recover, smoothstep(${(MEADOW_TERRAIN.maxX - MEADOW_FOG.border).toFixed(1)}, ${MEADOW_TERRAIN.maxX.toFixed(1)}, wp.x));
    recover = max(recover, smoothstep(${(MEADOW_TERRAIN.minZ + MEADOW_FOG.borderZ).toFixed(1)}, ${MEADOW_TERRAIN.minZ.toFixed(1)}, wp.z));
    return ramp * mix(cap, 1.0, recover);
  }
`;

// Traveling cloud shadows — a slow low-frequency dimming field drifting
// loosely downwind. THE scale cue: the lawn reads as a landscape under a
// sky rather than a carpet. Sampled per vertex (blobs are tens of units
// wide), halved at night where moon clouds should whisper.
const CLOUD_GLSL = /* glsl */ `
  float cloudAt(vec2 wxz) {
    float c = vnoise(wxz * 0.04 + uTime * vec2(-0.014, -0.011));
    return 1.0 - mix(0.11, 0.05, uDark) * smoothstep(0.45, 0.8, c);
  }
`;

const GRASS_VERTEX = /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  attribute float aSun;
  attribute float aShade;
  varying float vT;
  varying float vSun;
  varying float vShade;
  varying float vPatch;
  varying float vWind;
  varying float vLamp;
  varying float vCloud;
  varying float vFog;
  varying vec2 vUv;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  ${WIND_GLSL}
  ${DOME_GLSL}
  ${LAMP_GLSL}
  ${FOG_CAP_GLSL}
  ${CLOUD_GLSL}
  void main() {
    vec3 origin = vec3(instanceMatrix[3]);
    // Geometry is height-normalized: position.y IS the 0→1 wind/color gate.
    float t = position.y;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    // Wind displaces in WORLD space, after the instance yaw — displacing in
    // card space rotated every tuft's lean into a different direction and
    // scrambled the traveling gust front. Quadratic height gate keeps the
    // roots planted; magnitude scales with the tuft's world height.
    vec2 w = windAt(origin.xz, uTime * uWindSpeed);
    float hScale = length(vec3(instanceMatrix[1]));
    // The pointer parts the grass: tufts inside the poke radius lean
    // radially away, through the same height-gated bend as the wind (the
    // existing quadratic-drop line then squashes them down for free). The
    // COMBINED lean is clamped — the owner's "set max distortion": a gust
    // plus a poke can never fold a tuft flat.
    vec2 pk = origin.xz - uPoke.xy;
    float pkd = max(length(pk), 1e-4);
    float push = (1.0 - smoothstep(0.1, uPoke.z, pkd)) * uPoke.w;
    vec2 lean = w + pk / pkd * push;
    float ll = max(length(lean), 1e-4);
    lean *= min(ll, 0.42) / ll;
    vec2 disp = lean * t * t * hScale;
    world.x += disp.x;
    world.z += disp.y;
    world.y -= 0.4 * dot(disp, disp) / max(hScale, 1e-3);
    vec4 mv = viewMatrix * world;
    vT = t;
    vSun = aSun;
    vShade = aShade;
    // Patch-scale tip variation (FluffyGrass drives this with a perlin
    // texture; low-frequency value noise is the textureless equivalent).
    vPatch = vnoise(origin.xz * 0.16);
    vWind = length(w);
    vLamp = lampPool(origin);
    vCloud = cloudAt(origin.xz);
    vUv = uv;
    vFog = fogAmount(${GRASS_FOG}, world.xyz, -mv.z);
    vFogColor = domeBelow(world.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const GRASS_FRAGMENT = /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  uniform sampler2D uAlpha;
  varying float vT;
  varying float vSun;
  varying float vShade;
  varying float vPatch;
  varying float vWind;
  varying float vLamp;
  varying float vCloud;
  varying float vFog;
  varying vec2 vUv;
  varying vec3 vFogColor;
  void main() {
    // The tuft texture's red channel is the blade-cluster mask. Boost by
    // fog so mip-averaging can never thin the far field into stubble.
    float a = texture2D(uAlpha, vec2(vUv.x, 1.0 - vUv.y)).r;
    a *= 1.0 + vFog * 1.5;
    if (a < 0.12) discard;
    vec3 base = mix(uBaseL, uBaseD, uDark);
    vec3 tip = mix(mix(uTipAL, uTipBL, vPatch), mix(uTipAD, uTipBD, vPatch), uDark);
    vec3 col = mix(base, tip, vT);
    // Baked terrain-normal sun term — lit and shaded hill flanks. The moon
    // flattens it.
    col *= 1.0 + (vSun - 0.5) * mix(0.9, 0.35, uDark);
    // Furniture contact shadow (round 3: "much more prominent"): a direct
    // body multiplier, applied BEFORE the lamp pools so a practical can
    // still lift the grass it shades. Night eases off — moonlight ambient
    // fills real shadows.
    col *= mix(mix(0.35, 0.6, uDark), 1.0, vShade);
    // The dawn warms the tips along the traverse (standing down when the
    // seated DC vista owns the light); gusts catch a soft sheen.
    col *= 1.0 + vec3(0.055, 0.028, -0.020) * uDawn * vT * (1.0 - uSeat * 0.8);
    col *= 1.0 + vWind * 1.2 * vT * mix(0.35, 0.15, uDark);
    // Passing cloud shade.
    col *= vCloud;
    // Moonlight: a cool silver lift on the tips plus a traveling glint
    // where gusts bend them — the night lawn reads MOONLIT rather than
    // merely dark. Additive but tiny; stays far under the bloom knee.
    col += vec3(0.62, 0.68, 0.82) * uDark * vT * vT * (0.045 + vWind * 0.35 * vT);
    // The practicals' pools — tips catch more than roots, and the night
    // weighting is where the lamp actually reads. Additive in linear HDR
    // compounds under bloom, so the peak stays modest.
    col += ${LAMP_WARM} * vLamp * (0.3 + 0.7 * vT) * mix(0.10, 0.30, uDark);
    col = mix(col, vFogColor, vFog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const TERRAIN_VERTEX = /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  uniform vec3 uSunDir;
  attribute float aShade;
  varying vec3 vWorld;
  varying float vSun;
  varying float vShade;
  varying float vDepth;
  varying float vLamp;
  varying float vCloud;
  varying float vFog;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  ${DOME_GLSL}
  ${LAMP_GLSL}
  ${FOG_CAP_GLSL}
  ${CLOUD_GLSL}
  void main() {
    vWorld = position;
    vSun = 0.5 + 0.5 * dot(normalize(normal), uSunDir);
    vShade = aShade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    vLamp = lampPool(position);
    vCloud = cloudAt(position.xz);
    vFog = fogAmount(${TERRAIN_FOG}, position, -mv.z);
    vFogColor = domeBelow(position);
    gl_Position = projectionMatrix * mv;
  }
`;

const TERRAIN_FRAGMENT = /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  varying vec3 vWorld;
  varying float vSun;
  varying float vShade;
  varying float vDepth;
  varying float vLamp;
  varying float vCloud;
  varying float vFog;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  void main() {
    // The carpet: the ground must read as the grass mass's own depths, not
    // soil — mottled clumps in the SAME palette as the tufts, so coverage
    // gaps read as shadow between clumps. The finest octave fades with
    // distance so the carpet never shimmers against its mipless noise.
    float m1 = vnoise(vWorld.xz * 2.3);
    float m2 = vnoise(vWorld.xz * 7.1 + 13.0);
    float m3 = vnoise(vWorld.xz * 21.0 + 47.0) * smoothstep(20.0, 6.0, vDepth);
    float mott = 0.46 * m1 + 0.34 * m2 + 0.20 * m3;
    float patchN = vnoise(vWorld.xz * 0.16);
    vec3 base = mix(uBaseL, uBaseD, uDark);
    vec3 tip = mix(mix(uTipAL, uTipBL, patchN), mix(uTipAD, uTipBD, patchN), uDark);
    vec3 col = mix(base, tip * 0.82, 0.18 + 0.55 * mott);
    col *= 1.0 + (vSun - 0.5) * mix(0.9, 0.35, uDark);
    // The carpet sits under the tuft pile — its contact shadow runs a touch
    // shallower than the tufts' so the pile above stays the darkest read.
    col *= mix(mix(0.4, 0.62, uDark), 1.0, vShade);
    col *= 1.0 + vec3(0.055, 0.028, -0.020) * uDawn * 0.5 * (1.0 - uSeat * 0.8);
    col *= vCloud;
    // The carpet sits under the tuft pile, so its pool reads dimmer than
    // the lit tips above it.
    col += ${LAMP_WARM} * vLamp * mix(0.07, 0.22, uDark);
    col = mix(col, vFogColor, vFog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FLOWER_VERTEX = /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  uniform float uPixelScale;
  uniform float uPxFloor;
  attribute float aTint;
  varying float vTint;
  varying float vSpin;
  varying float vPx;
  varying float vClamp;
  varying float vLamp;
  varying float vFog;
  varying vec2 vUv;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  ${WIND_GLSL}
  ${DOME_GLSL}
  ${LAMP_GLSL}
  ${FOG_CAP_GLSL}
  void main() {
    vec3 origin = vec3(instanceMatrix[3]);
    // Identity instance rotation → the scale lives in [0][0].
    float s = instanceMatrix[0].x;
    vec2 toC = cameraPosition.xz - origin.xz;
    float dxz = max(length(toC), 1e-4);
    vec2 f = toC / dxz;
    // Y-billboard: quad x-axis perpendicular to the camera in the XZ plane.
    vec3 p = vec3(position.x * f.y, position.y, -position.x * f.x) * s;
    // Shares the grass wind at reduced amplitude; position.y / quad height
    // normalizes to the same radians·height product the tufts use. The
    // pointer poke rides the flowers' SLOW copy of the signal (uPokeF) at
    // a small factor — the first cut used the fast grass signal at 0.5,
    // which threw heads several head-heights sideways ("react way too
    // much / stretch too much"); 0.12 lands the same world-throw as the
    // clamped grass lean, and the lazy easing makes stems bend and
    // recover slowly instead of snapping.
    vec2 w = windAt(origin.xz, uTime * uWindSpeed) * 0.35;
    vec2 pk = origin.xz - uPokeF.xy;
    float pkd = max(length(pk), 1e-4);
    w += pk / pkd * (1.0 - smoothstep(0.1, uPokeF.z, pkd)) * uPokeF.w * 0.12;
    p.xz += w * position.y * ${(1 / FLOWER_H).toFixed(2)};
    // Pixel floor: a far head that would project under uPxFloor pixels is
    // scaled up about its own centre to hold that size, and the fragment
    // dissolves it toward the fog color by the clamped amount instead.
    vec3 c = vec3(0.0, ${(FLOWER_H / 2).toFixed(3)} * s, 0.0);
    float depth = -(viewMatrix * vec4(origin + c, 1.0)).z;
    float px = uPixelScale * ${FLOWER_H.toFixed(3)} * s / max(depth, 1e-3);
    float k = max(1.0, uPxFloor / max(px, 1e-4));
    p = (p - c) * k + c;
    vec4 world = modelMatrix * vec4(origin + p, 1.0);
    vec4 mv = viewMatrix * world;
    // Species tint is a per-instance attribute shared across a clump (one
    // clump, one color) rather than a position hash, which speckled every
    // cluster into a color mix.
    vTint = aTint;
    // Per-head petal rotation + projected size, for the fragment's rosette.
    vSpin = hash2(origin.xz * 43.7) * 6.2832;
    vPx = px;
    vClamp = 1.0 - 1.0 / k;
    vLamp = lampPool(origin);
    vUv = uv;
    // Flowers take 3/4 of the grass fog: they are the accents the eye is
    // meant to find, and at full fog the hill drifts vanished entirely
    // (round 3). They never reach the terrain borders (clipped rectangle,
    // z ≥ −22.8), so the under-fogging cannot expose an edge.
    vFog = fogAmount(${GRASS_FOG}, world.xyz, -mv.z) * 0.75;
    vFogColor = domeBelow(world.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FLOWER_FRAGMENT = /* glsl */ `
  uniform float uDark;
  uniform vec3 uFlowerA;
  uniform vec3 uFlowerB;
  uniform vec3 uFlowerC;
  uniform vec3 uNightA;
  uniform vec3 uNightB;
  varying float vTint;
  varying float vSpin;
  varying float vPx;
  varying float vClamp;
  varying float vLamp;
  varying float vFog;
  varying vec2 vUv;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  void main() {
    vec3 day = vTint < 0.55 ? uFlowerA : (vTint < 0.75 ? uFlowerB : uFlowerC);
    day *= 0.92 + 0.16 * hash2(vec2(vTint, 7.7));
    // Moonlit lavender, deliberately dim — near-white heads read as paper
    // scraps at 3:45am. The crossfade rides the shared uDark clock.
    // (0.65/0.85 still glowed against the rosette shapes at the owner's
    // round-3 browse — "too bright in dark mode" — so night dropped to
    // 0.45 and the crossfade runs nearly full.)
    vec3 night = mix(uNightA, uNightB, step(0.5, vTint)) * 0.42;
    vec3 col = mix(day, night, uDark * 0.94);
    // Petal rosette via discard (round 3: "clearly just circles") —
    // alpha-to-coverage broke under the postfx composer (non-MSAA target)
    // and canvas-alpha compositing, printing the full quad, so the shape
    // stays a hard discard mask. Cost over the old disc: one atan + one
    // cos per covered fragment, on a few thousand centimetre-scale quads —
    // nothing. Cornflowers get 6 lobes, poppies/daisies 5, each head spun
    // by its own hash. The silhouette collapses back to the plain disc as
    // the head shrinks toward the pixel floor, so far drifts stay calm
    // dots instead of shimmering stars.
    vec2 pq = (vUv - 0.5) * 2.0;
    float r = length(pq);
    float theta = atan(pq.y, pq.x) + vSpin;
    float lobes = vTint < 0.55 ? 6.0 : 5.0;
    float lobe = pow(0.5 + 0.5 * cos(lobes * theta), 0.65);
    float shape = smoothstep(7.0, 16.0, vPx);
    float petalR = mix(0.86, 0.30 + 0.62 * lobe, shape);
    if (r > max(petalR, 0.32)) discard;
    col *= 1.0 - 0.22 * smoothstep(0.30, 0.92, r);
    // Stamen — a warm eye in each head, dimming with the night. Fades in
    // with the petal shape so far dots keep their pure species color.
    vec3 stamen = mix(vec3(0.96, 0.80, 0.34), vec3(0.38, 0.37, 0.32), uDark * 0.94);
    col = mix(col, stamen, (1.0 - smoothstep(0.14, 0.30, r)) * shape);
    col += ${LAMP_WARM} * vLamp * mix(0.06, 0.20, uDark);
    col = mix(col, vFogColor, max(vFog, vClamp * 0.85));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------

/** Flower head: one quad, Y-billboarded in the vertex shader, with the
 * per-clump species tint riding along as an instanced attribute. */
function makeFlowerGeometry(tint: Float32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-FLOWER_HW, 0, 0, FLOWER_HW, 0, 0, FLOWER_HW, FLOWER_H, 0, -FLOWER_HW, FLOWER_H, 0],
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 1));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

function makeTerrainGeometry(): THREE.PlaneGeometry {
  const width = MEADOW_TERRAIN.maxX - MEADOW_TERRAIN.minX;
  const depth = MEADOW_TERRAIN.maxZ - MEADOW_TERRAIN.minZ;
  const geometry = new THREE.PlaneGeometry(
    width,
    depth,
    MEADOW_TERRAIN.segmentsX,
    MEADOW_TERRAIN.segmentsZ,
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(
    MEADOW_TERRAIN.minX + width / 2,
    0,
    MEADOW_TERRAIN.minZ + depth / 2,
  );
  const positions = geometry.attributes.position!;
  const shade = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, meadowHeight(x, z));
    shade[i] = shadeScale(x, z);
  }
  geometry.setAttribute("aShade", new THREE.BufferAttribute(shade, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Clone a tuft LOD out of the GLB, height-normalized so position.y is the
 * 0→1 gate (footprint scales along, ~2.5 per unit height), with the
 * stream's baked per-instance sun and contact-shadow terms attached. */
function prepareTuftGeometry(
  source: THREE.BufferGeometry,
  sun: Float32Array,
  shade: Float32Array,
): THREE.BufferGeometry {
  const geometry = source.clone();
  geometry.computeBoundingBox();
  const maxY = Math.max(geometry.boundingBox!.max.y, 1e-4);
  geometry.scale(1 / maxY, 1 / maxY, 1 / maxY);
  geometry.setAttribute("aSun", new THREE.InstancedBufferAttribute(sun, 1));
  geometry.setAttribute("aShade", new THREE.InstancedBufferAttribute(shade, 1));
  return geometry;
}

export default function Meadow({
  dark,
  rung = 3,
}: {
  dark: boolean;
  /** Quality rung (3 = full). Maps 1:1 onto MEADOW_RUNG_* counts; the
   * buffers' rung-stratified order makes each step a uniform density cut
   * across every band rather than a depth cut. */
  rung?: 0 | 1 | 2 | 3;
}) {
  const nearRef = useRef<THREE.InstancedMesh>(null);
  const farRef = useRef<THREE.InstancedMesh>(null);
  const flowerRef = useRef<THREE.InstancedMesh>(null);
  /** Dev-only density override: a 0..1 fraction of the full buffers that
   * beats the rung while set. Never written in production. */
  const densityRef = useRef<number | null>(null);

  const gltf = useGLTF(TUFT_URL, false);
  const alphaMap = useTexture(ALPHA_URL);

  const streams = useMemo(() => buildGrassInstances(), []);
  const flowers = useMemo(() => buildFlowerPositions(), []);

  const built = useMemo(() => {
    const c = (hex: string) => new THREE.Color(hex);
    // ONE set of uniform holders — every material references the SAME
    // { value } objects, so each per-frame write updates all of them.
    const shared = {
      uTime: { value: 0 },
      uDark: { value: dark ? 1 : 0 },
      uDawn: { value: 0 },
      uSeat: { value: 0 },
      uWindAmp: { value: 0.14 },
      uWindSpeed: { value: 0.85 },
      // skyShadow/dcWater come from PALETTES — never a duplicated hex.
      uShadowL: { value: c(PALETTES.light.skyShadow) },
      uShadowD: { value: c(PALETTES.dark.skyShadow) },
      uDcWaterL: { value: c(PALETTES.light.dcWater) },
      uDcWaterD: { value: c(PALETTES.dark.dcWater) },
      uBaseL: { value: c(COLORS.baseL) },
      uBaseD: { value: c(COLORS.baseD) },
      uTipAL: { value: c(COLORS.tipAL) },
      uTipAD: { value: c(COLORS.tipAD) },
      uTipBL: { value: c(COLORS.tipBL) },
      uTipBD: { value: c(COLORS.tipBD) },
      // Practical pools (meadowLights.ts) — positions and eased lit factors
      // rewritten each frame; glow 0 disables an unused slot outright.
      uLampPos: {
        value: Array.from(
          { length: MEADOW_LAMP_MAX },
          () => new THREE.Vector4(0, 0, 0, 1),
        ),
      },
      uLampGlow: { value: new Array<number>(MEADOW_LAMP_MAX).fill(0) },
      // Pointer poke (x, z, radius, strength) — written per frame below.
      // uPokeF is the flowers' slow-eased copy.
      uPoke: { value: new THREE.Vector4(0, 0, 0.6, 0) },
      uPokeF: { value: new THREE.Vector4(0, 0, 0.6, 0) },
    };
    const grassOnly = {
      uAlpha: { value: null as THREE.Texture | null },
    };
    const flowerOnly = {
      uFlowerA: { value: c(COLORS.flowerA) },
      uFlowerB: { value: c(COLORS.flowerB) },
      uFlowerC: { value: c(COLORS.flowerC) },
      uNightA: { value: c(COLORS.nightA) },
      uNightB: { value: c(COLORS.nightB) },
      uPixelScale: { value: 1000 },
      uPxFloor: { value: 2.0 },
    };
    return {
      shared,
      grassOnly,
      flowerOnly,
      terrainGeometry: makeTerrainGeometry(),
      flowerGeometry: makeFlowerGeometry(flowers.tint),
      terrainMaterial: new THREE.ShaderMaterial({
        uniforms: { ...shared, uSunDir: { value: SUN_DIR } },
        vertexShader: TERRAIN_VERTEX,
        fragmentShader: TERRAIN_FRAGMENT,
      }),
      // The tuft cards face every direction and cut out via discard —
      // DoubleSide + alpha test is the FluffyGrass technique; the opaque
      // FrontSide blade experiment is what the owner rejected.
      grassMaterial: new THREE.ShaderMaterial({
        uniforms: { ...shared, ...grassOnly },
        vertexShader: GRASS_VERTEX,
        fragmentShader: GRASS_FRAGMENT,
        side: THREE.DoubleSide,
      }),
      flowerMaterial: new THREE.ShaderMaterial({
        uniforms: { ...shared, ...flowerOnly },
        vertexShader: FLOWER_VERTEX,
        fragmentShader: FLOWER_FRAGMENT,
      }),
    };
    // Theme transitions run through uDark; remounting would make them snap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tuft geometries: LOD00 for the near lawn, LOD01 for mid + seated.
  const tuftGeometries = useMemo(() => {
    let lod0: THREE.BufferGeometry | null = null;
    let lod1: THREE.BufferGeometry | null = null;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (o.name.includes("LOD00")) lod0 = mesh.geometry;
      if (o.name.includes("LOD01")) lod1 = mesh.geometry;
    });
    if (!lod0 || !lod1) {
      throw new Error("grass-tuft.glb is missing its LOD00/LOD01 meshes");
    }
    return {
      near: prepareTuftGeometry(lod0, streams.near.sun, streams.near.shade),
      far: prepareTuftGeometry(lod1, streams.far.sun, streams.far.shade),
    };
  }, [gltf, streams]);

  // The alpha mask is data, not color — keep it linear so the threshold
  // means the same thing the source texture authored.
  useEffect(() => {
    alphaMap.colorSpace = THREE.NoColorSpace;
    alphaMap.needsUpdate = true;
    built.grassOnly.uAlpha.value = alphaMap;
  }, [alphaMap, built]);

  // Instance fill, once per stream. Matrices come out of meadowField's
  // rung-ordered streams; nothing here is ever rewritten.
  useEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const fill = (
      mesh: THREE.InstancedMesh | null,
      stream: typeof streams.near,
    ) => {
      if (!mesh) return;
      for (let i = 0; i < stream.count; i++) {
        position.set(stream.x[i]!, stream.y[i]!, stream.z[i]);
        euler.set(0, stream.yaw[i]!, 0);
        quaternion.setFromEuler(euler);
        scale.set(stream.width[i]!, stream.height[i]!, stream.width[i]);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    fill(nearRef.current, streams.near);
    fill(farRef.current, streams.far);
    const flowerMesh = flowerRef.current;
    if (!flowerMesh) return;
    quaternion.identity();
    for (let i = 0; i < flowers.count; i++) {
      position.set(flowers.x[i]!, flowers.y[i]!, flowers.z[i]);
      scale.setScalar(flowers.scale[i]!);
      matrix.compose(position, quaternion, scale);
      flowerMesh.setMatrixAt(i, matrix);
    }
    flowerMesh.instanceMatrix.needsUpdate = true;
    flowerMesh.computeBoundingSphere();
    // The buffers are filled and the GLB/alpha suspended above us, so the
    // next painted frame contains grass — tell the boot reveal gate.
    markMeadowReady();
  }, [streams, flowers]);

  // Live browse knobs on the house dev-hook object. Writes go straight into
  // the shared uniform holders, so every material follows at once; winning
  // values get baked into the defaults above. Zero production cost.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const hooks = window.__stacks;
    if (!hooks) return;
    hooks.meadow = (opts) => {
      if (opts?.wind !== undefined) built.shared.uWindAmp.value = opts.wind;
      if (opts?.speed !== undefined) built.shared.uWindSpeed.value = opts.speed;
      if (opts?.density !== undefined) densityRef.current = opts.density;
      return {
        wind: built.shared.uWindAmp.value,
        speed: built.shared.uWindSpeed.value,
        density: densityRef.current,
      };
    };
    return () => {
      delete hooks.meadow;
    };
  }, [built]);

  // Click pulse for the pointer poke: stamped in the scene's own uTime
  // clock (written every frame below) so the pulse math never mixes time
  // bases. Any pointerdown counts — if the cursor is over a card the hit
  // point is hidden behind it anyway.
  const pokeClickAt = useRef(-100);
  const bootAt = useRef(-1);
  useEffect(() => {
    if (!finePointer) return;
    const onDown = () => {
      pokeClickAt.current = built.shared.uTime.value;
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [built]);

  useEffect(
    () => () => {
      built.terrainGeometry.dispose();
      built.flowerGeometry.dispose();
      built.terrainMaterial.dispose();
      built.grassMaterial.dispose();
      built.flowerMaterial.dispose();
      tuftGeometries.near.dispose();
      tuftGeometries.far.dispose();
    },
    [built, tuftGeometries],
  );

  // The complete per-frame cost: six uniform writes and three count fields.
  useFrame(({ clock, gl, camera, pointer }, delta) => {
    const shared = built.shared;
    // Pointer → lawn: unproject the cursor and hit the base ground plane
    // analytically (no raycaster, no geometry walk). Owner-tuned feel
    // (round 3, second pass): hover is a whisper — slow fluid trail, low
    // strength — and a CLICK breathes a short stronger pulse through the
    // same spot. Fine pointers only — a touch would leave a frozen dent
    // under the last tap.
    if (finePointer) {
      const poke = shared.uPoke.value;
      pokeScratch.set(pointer.x, pointer.y, 0.5).unproject(camera);
      pokeScratch.sub(camera.position).normalize();
      let target = 0;
      if (pokeScratch.y < -1e-3) {
        const tt = (MEADOW_GROUND_BASE - camera.position.y) / pokeScratch.y;
        if (tt > 0 && tt < 26) {
          const hx = camera.position.x + pokeScratch.x * tt;
          const hz = camera.position.z + pokeScratch.z * tt;
          poke.x = THREE.MathUtils.damp(poke.x, hx, 7, delta);
          poke.y = THREE.MathUtils.damp(poke.y, hz, 7, delta);
          const pokeF = shared.uPokeF.value;
          pokeF.x = THREE.MathUtils.damp(pokeF.x, hx, 3.5, delta);
          pokeF.y = THREE.MathUtils.damp(pokeF.y, hz, 3.5, delta);
          const sinceClick = clock.elapsedTime - pokeClickAt.current;
          target =
            0.24 + 0.34 * Math.exp(-(sinceClick * sinceClick) / 0.18);
        }
      }
      poke.w = THREE.MathUtils.damp(poke.w, target, 3.5, delta);
      // Stems are lazier than blades: the flowers' strength eases at less
      // than half the grass rate, both bending and recovering.
      shared.uPokeF.value.w = THREE.MathUtils.damp(
        shared.uPokeF.value.w,
        target,
        1.5,
        delta,
      );
    }
    shared.uDark.value = THREE.MathUtils.damp(
      shared.uDark.value,
      dark ? 1 : 0,
      3.5,
      delta,
    );
    shared.uDawn.value = progressRef.current;
    // CameraRig writes this every frame while it eases; reading it here
    // keeps React out of the loop, same as the dome.
    shared.uSeat.value = getSeatAmount();
    shared.uTime.value = clock.elapsedTime;
    // Boot gust: one wind swell sweeps the lawn as the reveal lands (the
    // meadow's first frames sit just ahead of it), then the amplitude
    // settles to the authored 0.14 and stops being written — the dev wind
    // knob owns it from there.
    if (bootAt.current < 0) bootAt.current = clock.elapsedTime;
    const since = clock.elapsedTime - bootAt.current;
    if (since < 6) {
      const g = Math.exp(-((since - 1.6) * (since - 1.6)) / 1.1);
      shared.uWindAmp.value = 0.14 * (1 + 1.4 * g);
    }
    // Pixels per world unit at depth 1 — one multiply per frame buys
    // resize/dpr safety with no listener.
    built.flowerOnly.uPixelScale.value =
      (gl.domElement.height * camera.projectionMatrix.elements[5]) / 2;
    // Practical pools: mirror the registry into the uniform array. Reading
    // the lit refs here (not React state) keeps the click-off egg's ease
    // frame-locked with the lamp's own glow sprites.
    let li = 0;
    const lt = clock.elapsedTime;
    for (const lamp of getMeadowLamps().values()) {
      if (li >= MEADOW_LAMP_MAX) break;
      shared.uLampPos.value[li]!.set(lamp.x, lamp.y, lamp.z, lamp.radius);
      // Filament breathing: a few percent of two incommensurate sines per
      // slot — the pools flicker like real practicals at night.
      shared.uLampGlow.value[li] =
        lamp.litRef.current *
        lamp.strength *
        (1 + 0.04 * Math.sin(lt * 11 + li * 7.3) + 0.025 * Math.sin(lt * 27 + li * 2.1));
      li++;
    }
    for (; li < MEADOW_LAMP_MAX; li++) shared.uLampGlow.value[li] = 0;
    const density = densityRef.current;
    const countFor = (table: readonly number[]) =>
      density === null
        ? table[rung]!
        : Math.round(table[3]! * Math.min(1, Math.max(0, density)));
    if (nearRef.current) nearRef.current.count = countFor(MEADOW_RUNG_GRASS_NEAR);
    if (farRef.current) farRef.current.count = countFor(MEADOW_RUNG_GRASS_FAR);
    if (flowerRef.current) flowerRef.current.count = countFor(MEADOW_RUNG_FLOWERS);
  });

  // Draw order terrain → grass → flowers.
  return (
    <group>
      <mesh geometry={built.terrainGeometry} material={built.terrainMaterial} />
      <instancedMesh
        ref={nearRef}
        args={[tuftGeometries.near, built.grassMaterial, MEADOW_RUNG_GRASS_NEAR[3]]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={farRef}
        args={[tuftGeometries.far, built.grassMaterial, MEADOW_RUNG_GRASS_FAR[3]]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={flowerRef}
        args={[built.flowerGeometry, built.flowerMaterial, MEADOW_FLOWER_TOTAL]}
        frustumCulled={false}
      />
    </group>
  );
}

useGLTF.preload(TUFT_URL, false);
// Without this the alpha texture only starts fetching when the component
// first renders — one Suspense round-trip later than the GLB, and exactly
// the kind of straggler the boot reveal used to race. Both assets now join
// the FIRST loading-manager batch at chunk eval.
useTexture.preload(ALPHA_URL);
