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
// frame. Near lawn, far lawn, and flowers are spatially tiled over shared
// geometry/materials so Three can reject offscreen vegetation by frustum.
import { sceneAudio } from "../audio/sceneAudio";
import { useWorldBootScope } from "../boot/useWorldBoot";
import { progressRef, touchWorldRef } from "../store";
import { PALETTES } from "../theme";
import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  type MutableRefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";

import {
  freeRoamDiagnosticsController,
  freeRoamFogVisible,
} from "./freeRoamDiagnostics";
import {
  GOLF_COURSE_CENTER,
  GOLF_CUP,
  GOLF_CUP_WORLD_CENTER,
  GOLF_GREEN,
  suppressGolfVegetation,
} from "./golf/golfCourse";
import {
  GOLF_DARK_GREEN_FINAL_CEILING,
  GOLF_GREEN_COLORS,
  GOLF_GREEN_FOG_SCALE,
  golfRgbGlsl,
} from "./golf/golfPresentation";
import { claimEffectLayer, effectLayerAges } from "./layeredEffects";
import {
  MEADOW_DEFORMATION,
  MEADOW_DEFORMATION_BOUNDS,
  MeadowDeformationController,
  type MeadowDeformationQuality,
} from "./meadowDeformation";
import {
  type MeadowDiagnosticsUpdate,
  meadowDiagnosticsController,
} from "./meadowDiagnostics";
import {
  getMeadowDisturbance,
  publishMeadowDisturbance,
  resetMeadowDisturbance,
  visitMeadowPhysicalEventsSince,
} from "./meadowDisturbance";
import {
  FLOWER_VARIATION,
  IDLE_TERRAIN_BUILD_GATE,
  MEADOW_BANK,
  MEADOW_FOG,
  MEADOW_GROUND_BASE,
  MEADOW_TERRAIN,
  type MeadowTile,
  type TerrainBuildGate,
  type TerrainGeometryCache,
  buildFlowerPositions,
  buildGrassInstances,
  buildMeadowTiles,
  createTerrainGeometryCache,
  grassTuftNormalizationScale,
  meadowContentPlan,
  meadowHeight,
  meadowTileDrawCount,
  nextTerrainBuildGate,
  shadeScale,
} from "./meadowField";
import { meadowPokeStrength } from "./meadowInteraction";
import { MEADOW_LAMP_MAX, getMeadowLamps } from "./meadowLights";
import {
  MEADOW_IMPACT,
  MEADOW_POKE,
  MEADOW_WIND,
  meadowDragSample,
  meadowPulseState,
  meadowWindAudioLevel,
  sampleMeadowWind,
} from "./meadowMotion";
import { type SceneContentTier } from "./quality";
import {
  isSceneTraveling,
  meadowTilePopulationLimit,
  useScenePerformanceSettings,
} from "./scenePerformance";
import { useSceneQualityControls } from "./sceneQualityController";
import { getSeatAmount } from "./seated";
import { StaticWorldRoot } from "./staticWorld";

const TUFT_URL = "/models/grass-tuft.glb";
const ALPHA_URL = "/images/stacks/grass-tuft-alpha.webp";
export const MEADOW_RETIRE_SECONDS = 0.8;

// Flower-only colors live here. Grass colors are part of PALETTES because the
// boot vignette now uses the same meadow tone to bridge its sky and wood.
const COLORS = {
  // Round 3 deepened A and B ("in general in light mode it's hard to see
  // them"): more chroma survives the fog mix and the pale lawn behind.
  flowerA: "#5b76d6", // cornflower blue
  flowerB: "#e0862f", // poppy orange
  flowerC: "#ece0c6", // cream
  // Rare per-head accents. Position hashing scatters these through clumps
  // without changing the dominant field palette.
  flowerRareA: "#b85cbf", // orchid
  flowerRareB: "#43a58f", // mint
  // Night heads: dim but SATURATED (round-3 third pass: "too bright and
  // not vibrant enough in dark mode") — moonlit cornflower and violet
  // rather than the old grey lavenders.
  nightA: "#6f79c8",
  nightB: "#a290c8",
  nightRareA: "#b477bd",
  nightRareB: "#64ad9d",
} as const;

/** KeyLight's constant direction (eye-relative offset (4, 7, 6) — see
 * meadowField's bakedSun, which uses the same vector for tufts). */
const SUN_DIR = new THREE.Vector3(4, 7, 6).normalize();

// Flower quad, world units before instance scale.
const FLOWER_HW = 0.024;
const FLOWER_H = 0.048;

/** Whether the primary device supports hover. Touch input can still take over
 * this path on hybrid devices. Evaluated once (SSR-safe). */
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
    vec2 wind = dir * (uWindAmp * (0.35 + 0.85 * gust + 0.25 * breeze));
    float magnitude = length(wind);
    if (magnitude > ${MEADOW_WIND.gustKnee.toFixed(2)}) {
      float span = ${(MEADOW_WIND.gustCeiling - MEADOW_WIND.gustKnee).toFixed(2)};
      float limited = ${MEADOW_WIND.gustKnee.toFixed(2)}
        + span * (1.0 - exp(-(magnitude - ${MEADOW_WIND.gustKnee.toFixed(2)}) / span));
      wind *= limited / magnitude;
    }
    return wind;
  }
  // Far tufts occupy a few pixels and cannot reveal the detailed direction
  // field or nonlinear gust limiter. One traveling noise sample preserves a
  // coherent breeze without paying the near lawn's three samples + trig/exp.
  vec2 farWindAt(vec2 pos, float t) {
    vec2 dir = vec2(-0.702, -0.712);
    float gust = vnoise(pos * 0.18 - dir * (t * 0.48));
    return dir * (uWindAmp * (0.42 + 0.72 * gust * gust));
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
const MEADOW_PULSE_LAYERS = 6;

const SHARED_UNIFORMS_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uDark;
  uniform float uOpacity;
  // Pointer poke: ground-plane hit under the cursor (.xy = world x/z),
  // radius (.z) and eased strength (.w). Tufts and flower heads lean away
  // from it — the lawn answers the pointer like the props do. uPokeF is
  // the FLOWERS' copy of the same signal, eased much more slowly (stems
  // bend and recover lazily where blades spring).
  uniform vec4 uPoke;
  uniform vec4 uPokeF;
  uniform vec2 uPokeDir;
  // Concurrent expanding click rings: origin (.xy), radius (.z), strength
  // (.w). A bounded pool keeps repeated clicks layered without unbounded
  // shader work.
  uniform vec4 uPulses[${MEADOW_PULSE_LAYERS}];
  uniform float uDawn;
  uniform float uSeat;
  uniform float uWindAmp;
  uniform float uWindSpeed;
  uniform float uFogEnabled;
  #ifdef COORDINATION_ENVIRONMENT_FLICKER
    uniform float uEnvironmentFlicker;
  #endif
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
    // First cut (0.11 deep, ~70s per blob) was imperceptible — the owner
    // asked where it was. Now ~25s per blob and a real shadow in light;
    // night stays a whisper.
    float c = vnoise(wxz * 0.04 + uTime * vec2(-0.042, -0.033));
    return 1.0 - mix(0.17, 0.05, uDark) * smoothstep(0.42, 0.72, c);
  }
`;

export const meadowGrassVertexShader = (deformation: boolean) => /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  #ifdef CINEMATIC_PLUS_SHADOWS
    #include <common>
    #include <shadowmap_pars_vertex>
  #endif
  // InstancedMesh injects instanceColor per tile (r = terrain sun,
  // g = furniture contact shade) while every tile shares one geometry.
  varying float vT;
  varying float vSun;
  varying float vShade;
  varying float vApron;
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
  ${deformation ? `uniform sampler2D uDeformation;` : ""}
  void main() {
    vec3 origin = vec3(instanceMatrix[3]);
    // Geometry is height-normalized: position.y IS the 0→1 wind/color gate.
    float t = position.y;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    float hScale = length(vec3(instanceMatrix[1]));
    ${
      deformation
        ? `
    vec2 deformationUv = vec2(
      (origin.x - ${MEADOW_DEFORMATION_BOUNDS.minX.toFixed(1)}) / ${(MEADOW_DEFORMATION_BOUNDS.maxX - MEADOW_DEFORMATION_BOUNDS.minX).toFixed(1)},
      (origin.z - ${MEADOW_DEFORMATION_BOUNDS.minZ.toFixed(1)}) / ${(MEADOW_DEFORMATION_BOUNDS.maxZ - MEADOW_DEFORMATION_BOUNDS.minZ).toFixed(1)}
    );
    vec4 deformationSample = texture2D(uDeformation, deformationUv);
    deformationSample *= step(0.0, deformationUv.x) * step(deformationUv.x, 1.0)
      * step(0.0, deformationUv.y) * step(deformationUv.y, 1.0);
    float deformationMagnitude = deformationSample.a;
    vec2 deformationBaseDirection = deformationMagnitude > 0.001
      ? (deformationSample.rg / deformationMagnitude - 0.5) * 2.0
      : vec2(0.0);
    float deformationDirectionLength = length(deformationBaseDirection);
    float deformationSplay = (vnoise(origin.xz * 4.73) - 0.5)
      * ${MEADOW_DEFORMATION.directionSplay.toFixed(2)};
    vec2 deformationDirection = deformationDirectionLength > 0.001
      ? normalize(
          deformationBaseDirection
          + vec2(-deformationBaseDirection.y, deformationBaseDirection.x)
            * deformationSplay
        )
      : deformationBaseDirection;
    float deformationFlattening = deformationMagnitude > 0.001
      ? deformationSample.b / deformationMagnitude
      : 0.0;
    `
        : `
    float deformationMagnitude = 0.0;
    vec2 deformationDirection = vec2(0.0);
    float deformationFlattening = 0.0;
    `
    }
    #ifdef FAR_SIMPLE
      vec2 w = farWindAt(origin.xz, uTime * uWindSpeed);
      vec2 lean = w;
    #else
    vec2 w = windAt(origin.xz, uTime * uWindSpeed);
    // Mouse travel brushes a tight patch in the direction of the stroke.
    // Clicking creates a separate, immediately broad outward burst. The
    // COMBINED lean is clamped so a gust plus interaction cannot fold a
    // tuft flat.
    vec2 pk = origin.xz - uPoke.xy;
    float pkd = max(length(pk), 1e-4);
    // Hover is a brush, not a force field: the spatial mask follows the
    // trailing cursor centre, while uPokeDir points along mouse travel.
    float pokeShape = 1.0 - smoothstep(0.0, uPoke.z, pkd);
    vec2 pulseLean = vec2(0.0);
    float pulseActivity = 0.0;
    for (int pi = 0; pi < ${MEADOW_PULSE_LAYERS}; pi++) {
      vec4 pulse = uPulses[pi];
      vec2 pulseDelta = origin.xz - pulse.xy;
      float pulseDistance = max(length(pulseDelta), 1e-4);
      // Full force begins on a compact front, then the front races outward
      // while fading. Unlike the old sine envelope, it never powers up late.
      float pulseShape = 1.0 - smoothstep(
        ${MEADOW_POKE.pulseWidth.toFixed(2)} * 0.35,
        ${MEADOW_POKE.pulseWidth.toFixed(2)},
        abs(pulseDistance - pulse.z)
      );
      float activity = clamp(pulse.w / ${MEADOW_POKE.clickStrength.toFixed(2)}, 0.0, 1.0);
      pulseActivity = max(pulseActivity, pulseShape * activity);
      pulseLean += pulseDelta / pulseDistance * pulseShape * pulse.w;
    }
    float pokeActivity = clamp(uPoke.w / ${MEADOW_POKE.hoverStrength.toFixed(2)}, 0.0, 1.0);
    // Give the click's first frame room instead of summing two full-strength
    // interactions into the hard lean limit.
    float push = pokeShape * uPoke.w * (1.0 - 0.70 * pulseActivity);
    float interactionShape = max(
      pokeShape * pokeActivity,
      pulseActivity
    );
    vec2 lean = w * (1.0 - ${MEADOW_POKE.windSuppression.toFixed(2)} * interactionShape)
      + uPokeDir * push
      + pulseLean;
    #endif
    lean = lean * (1.0 - ${MEADOW_DEFORMATION.motionSuppression.toFixed(2)} * deformationMagnitude)
      + deformationDirection * (${MEADOW_DEFORMATION.maxLean.toFixed(2)} * deformationMagnitude);
    float ll = max(length(lean), 1e-4);
    lean *= min(ll, ${MEADOW_DEFORMATION.maxLean.toFixed(2)}) / ll;
    // Apply one affine lean to the authored tuft. The former t² gate changed
    // its curvature every frame, which read as growth and shrinkage. A linear
    // height term keeps the complete footprint planted and approximates a
    // rotation to second order without sin/cos or another matrix multiply.
    float swayHeight = max(t, 0.0) * hScale;
    world.y -= swayHeight * ${MEADOW_DEFORMATION.heightCompression.toFixed(2)}
      * deformationFlattening * deformationMagnitude;
    vec2 disp = lean * swayHeight;
    world.x += disp.x;
    world.z += disp.y;
    world.y -= 0.5 * dot(lean, lean) * swayHeight;
    #ifdef CINEMATIC_PLUS_SHADOWS
      vec3 transformedNormal = normalize(
        normalMatrix * mat3(instanceMatrix) * normal
      );
      vec4 worldPosition = world;
      #include <shadowmap_vertex>
    #endif
    vec4 mv = viewMatrix * world;
    vT = t;
    vSun = instanceColor.r;
    vShade = instanceColor.g;
    vApron = instanceColor.b;
    // Patch-scale tip variation (FluffyGrass drives this with a perlin
    // texture; low-frequency value noise is the textureless equivalent).
    vPatch = vnoise(origin.xz * 0.16);
    vWind = length(w);
    #ifdef FAR_SIMPLE
      vLamp = 0.0;
    #else
      vLamp = lampPool(origin);
    #endif
    vCloud = cloudAt(origin.xz);
    vUv = uv;
    vFog = fogAmount(${GRASS_FOG}, world.xyz, -mv.z) * uFogEnabled;
    vFogColor = domeBelow(world.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const GRASS_FRAGMENT = /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  #ifdef CINEMATIC_PLUS_SHADOWS
    #include <common>
    uniform bool receiveShadow;
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
  #endif
  uniform sampler2D uAlpha;
  varying float vT;
  varying float vSun;
  varying float vShade;
  varying float vApron;
  varying float vPatch;
  varying float vWind;
  varying float vLamp;
  varying float vCloud;
  varying float vFog;
  varying vec2 vUv;
  varying vec3 vFogColor;
  void main() {
    // The camera-side apron only belongs to the horizontal traverse. It sits
    // below/behind that camera at rest and fills the corners during a fling;
    // discard it once the chair transition begins so the seated riverbank
    // keeps its separately authored density.
    if (vApron > 0.5 && uSeat > 0.001) discard;
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
    #ifdef CINEMATIC_PLUS_SHADOWS
      // Props and shelf edges now cut into the visible tuft pile instead of
      // disappearing beneath its custom unlit material.
      col *= mix(0.46, 1.0, getShadowMask());
    #endif
    // Moonlight: mostly a traveling glint where gusts bend the tips, over
    // a whisper of constant lift — the night lawn reads MOONLIT rather
    // than merely dark. The tint leans GREEN on purpose: the first cut's
    // silver-blue read as a grey wash over the lawn ("did you just make
    // the grass less green in dark mode?"). Additive but tiny; stays far
    // under the bloom knee.
    col += vec3(0.5, 0.74, 0.6) * uDark * vT * vT * (0.02 + vWind * 0.35 * vT);
    // The practicals' pools — tips catch more than roots, and the night
    // weighting is where the lamp actually reads. Additive in linear HDR
    // compounds under bloom, so the peak stays modest.
    col += ${LAMP_WARM} * vLamp * (0.3 + 0.7 * vT) * mix(0.10, 0.30, uDark);
    col = mix(col, vFogColor, vFog);
    #ifdef COORDINATION_ENVIRONMENT_FLICKER
      col *= uEnvironmentFlicker;
    #endif
    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const TERRAIN_VERTEX = /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  #ifdef CINEMATIC_PLUS_SHADOWS
    #include <common>
    #include <shadowmap_pars_vertex>
  #endif
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
    vFog = fogAmount(${TERRAIN_FOG}, position, -mv.z) * uFogEnabled;
    vFogColor = domeBelow(position);
    #ifdef CINEMATIC_PLUS_SHADOWS
      vec3 transformedNormal = normalize(normalMatrix * normal);
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      #include <shadowmap_vertex>
    #endif
    gl_Position = projectionMatrix * mv;
  }
`;

const TERRAIN_FRAGMENT = /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  #ifdef CINEMATIC_PLUS_SHADOWS
    #include <common>
    uniform bool receiveShadow;
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
  #endif
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
    // The flag model supplies the recessed liner and bottom. Discarding the
    // shared terrain only inside its lip lets that geometry read as a real
    // opening instead of being buried beneath the meadow carpet.
    float cupDistance = distance(
      vWorld.xz,
      vec2(${GOLF_CUP_WORLD_CENTER.x.toFixed(4)}, ${GOLF_CUP_WORLD_CENTER.z.toFixed(4)})
    );
    if (cupDistance < ${(GOLF_CUP.radius * 0.985).toFixed(4)}) discard;
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
    // The putting surface is painted into the shared meadow material. An
    // analytic ellipse keeps the crosshatch bounded and avoids another mesh
    // or texture fetch; the feathered fringe agrees with golfCourse.ts.
    vec2 golfCenter = vec2(${GOLF_COURSE_CENTER.x.toFixed(4)}, ${GOLF_COURSE_CENTER.z.toFixed(4)});
    float golfYaw = ${GOLF_COURSE_CENTER.yaw.toFixed(4)};
    vec2 gd = vWorld.xz - golfCenter;
    vec2 glocal = vec2(
      gd.x * cos(golfYaw) - gd.y * sin(golfYaw),
      gd.x * sin(golfYaw) + gd.y * cos(golfYaw)
    );
    float greenD = length(glocal / vec2(${(GOLF_GREEN.width / 2).toFixed(2)}, ${(GOLF_GREEN.depth / 2).toFixed(2)}));
    float fringeD = length(glocal / vec2(${(GOLF_GREEN.width / 2 + GOLF_GREEN.fringe).toFixed(2)}, ${(GOLF_GREEN.depth / 2 + GOLF_GREEN.fringe).toFixed(2)}));
    float fringeMask = (1.0 - smoothstep(0.98, 1.02, fringeD))
      * smoothstep(0.96, 1.01, greenD);
    float greenMask = 1.0 - smoothstep(0.97, 1.02, greenD);
    // Broad diagonal mowing passes hold up through the scene fog better than
    // the former hairline pattern. Crossing two passes gives the green its
    // soft diamond checker without introducing a texture or shimmer.
    float hatchA = smoothstep(0.42, 0.58, 0.5 + 0.5 * sin((glocal.x + glocal.y) * 8.4));
    float hatchB = smoothstep(0.42, 0.58, 0.5 + 0.5 * sin((glocal.x - glocal.y) * 8.4));
    float hatch = (hatchA + hatchB) * 0.5;
    vec3 greenLow = mix(${golfRgbGlsl(GOLF_GREEN_COLORS.lightLow)}, ${golfRgbGlsl(GOLF_GREEN_COLORS.darkLow)}, uDark);
    vec3 greenHigh = mix(${golfRgbGlsl(GOLF_GREEN_COLORS.lightHigh)}, ${golfRgbGlsl(GOLF_GREEN_COLORS.darkHigh)}, uDark);
    vec3 greenCol = mix(greenLow, greenHigh, 0.30 + hatch * 0.40);
    vec3 fringeCol = mix(${golfRgbGlsl(GOLF_GREEN_COLORS.lightFringe)}, ${golfRgbGlsl(GOLF_GREEN_COLORS.darkFringe)}, uDark);
    col = mix(col, fringeCol, fringeMask);
    col = mix(col, greenCol, greenMask);
    // Low-frequency earthiness: warm mineral soil, cool moss, and dry grass
    // emerge as value/roughness-like modulation of the existing carpet. No
    // photo texture or extra detail octave enters the scene.
    float earthN = vnoise(vWorld.xz * 0.075 + 31.0);
    float mossN = vnoise(vWorld.xz * 0.11 + 73.0);
    float dryN = vnoise(vWorld.xz * 0.09 + 119.0);
    vec3 soil = mix(vec3(0.25, 0.17, 0.10), vec3(0.12, 0.10, 0.08), uDark);
    vec3 moss = mix(vec3(0.25, 0.34, 0.18), vec3(0.14, 0.22, 0.17), uDark);
    vec3 dryGrass = mix(vec3(0.52, 0.43, 0.25), vec3(0.27, 0.25, 0.18), uDark);
    col = mix(col, soil, smoothstep(0.74, 0.94, earthN) * 0.14);
    col = mix(col, moss, smoothstep(0.70, 0.93, mossN) * 0.10);
    col = mix(col, dryGrass, smoothstep(0.78, 0.96, dryN) * 0.08);
    col *= 1.0 + (vSun - 0.5) * mix(0.9, 0.35, uDark);
    // The carpet sits under the tuft pile — its contact shadow runs a touch
    // shallower than the tufts' so the pile above stays the darkest read.
    col *= mix(mix(0.4, 0.62, uDark), 1.0, vShade);
    col *= 1.0 + vec3(0.055, 0.028, -0.020) * uDawn * 0.5 * (1.0 - uSeat * 0.8);
    col *= vCloud;
    #ifdef CINEMATIC_PLUS_SHADOWS
      // The carpet is the continuous receiver beneath the tuft cards. A deep
      // floor keeps projected silhouettes readable through the grass gaps.
      col *= mix(0.34, 1.0, getShadowMask());
    #endif
    // The carpet sits under the tuft pile, so its pool reads dimmer than
    // the lit tips above it.
    col += ${LAMP_WARM} * vLamp * mix(0.07, 0.22, uDark);
    float greenFogScale = mix(${GOLF_GREEN_FOG_SCALE.light.toFixed(2)}, ${GOLF_GREEN_FOG_SCALE.dark.toFixed(2)}, uDark);
    float localFog = mix(vFog, vFog * greenFogScale, greenMask);
    col = mix(col, vFogColor, localFog);
    // Theme-space values are linear and therefore display much brighter after
    // colorspace conversion. Cap only the dark green after every lighting/fog
    // contribution so it cannot flare neon while the rest of the meadow stays
    // moonlit; the low/high mowing contrast remains below this ceiling.
    col = mix(
      col,
      min(col, ${golfRgbGlsl(GOLF_DARK_GREEN_FINAL_CEILING)}),
      greenMask * uDark
    );
    #ifdef COORDINATION_ENVIRONMENT_FLICKER
      col *= uEnvironmentFlicker;
    #endif
    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FLOWER_VERTEX = /* glsl */ `
  ${SHARED_UNIFORMS_GLSL}
  uniform float uPixelScale;
  uniform float uPxFloor;
  // InstancedMesh injects instanceColor per tile while every tile shares one
  // geometry; red carries the authored species tint, green the independent
  // per-head variation, and blue tags the camera-side fling apron.
  varying float vTint;
  varying float vApron;
  varying float vVariation;
  varying float vColorVariation;
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
    float headVariation = instanceColor.g;
    float rotationVariation = hash2(origin.xz * 37.1 + vec2(11.7, 29.3));
    float aspectVariation = hash2(origin.zx * 19.3 + vec2(7.1, 41.9));
    float tilt = (rotationVariation - 0.5) * ${(FLOWER_VARIATION.tiltRadians * 2).toFixed(3)};
    float tiltC = cos(tilt);
    float tiltS = sin(tilt);
    float aspect = mix(
      ${FLOWER_VARIATION.aspect[0].toFixed(2)},
      ${FLOWER_VARIATION.aspect[1].toFixed(2)},
      aspectVariation
    );
    vec2 local = vec2(
      position.x * aspect,
      (position.y - ${(FLOWER_H / 2).toFixed(3)}) / aspect
    );
    vec2 tilted = vec2(
      tiltC * local.x - tiltS * local.y,
      tiltS * local.x + tiltC * local.y
    );
    // Y-billboard: quad x-axis perpendicular to the camera in the XZ plane,
    // with a small per-head screen-plane lean around its own center.
    vec3 p = vec3(
      tilted.x * f.y,
      tilted.y + ${(FLOWER_H / 2).toFixed(3)},
      -tilted.x * f.x
    ) * s;
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
    vec2 pulseLean = vec2(0.0);
    float pulseActivity = 0.0;
    for (int pi = 0; pi < ${MEADOW_PULSE_LAYERS}; pi++) {
      vec4 pulse = uPulses[pi];
      vec2 pulseDelta = origin.xz - pulse.xy;
      float pulseDistance = max(length(pulseDelta), 1e-4);
      float pulseShape = 1.0 - smoothstep(
        ${MEADOW_POKE.pulseWidth.toFixed(2)} * 0.35,
        ${MEADOW_POKE.pulseWidth.toFixed(2)},
        abs(pulseDistance - pulse.z)
      );
      float activity = clamp(pulse.w / ${MEADOW_POKE.clickStrength.toFixed(2)}, 0.0, 1.0);
      pulseActivity = max(pulseActivity, pulseShape * activity);
      pulseLean += pulseDelta / pulseDistance * pulseShape * pulse.w * 0.10;
    }
    w += uPokeDir
      * (1.0 - smoothstep(0.0, uPokeF.z, pkd))
      * uPokeF.w
      * (1.0 - 0.70 * pulseActivity)
      * 0.12;
    w += pulseLean;
    p.xz += w * position.y * ${(1 / FLOWER_H).toFixed(2)};
    // Pixel floor: a far head that would project under uPxFloor pixels is
    // scaled up about its own centre to hold that size, and the fragment
    // dissolves it toward the fog color by the clamped amount instead.
    vec3 c = vec3(0.0, ${(FLOWER_H / 2).toFixed(3)} * s, 0.0);
    float depth = -(viewMatrix * vec4(origin + c, 1.0)).z;
    float px = uPixelScale * ${FLOWER_H.toFixed(3)} * s / max(depth, 1e-3);
    float pxFloor = uPxFloor * mix(
      ${FLOWER_VARIATION.pixelFloor[0].toFixed(2)},
      ${FLOWER_VARIATION.pixelFloor[1].toFixed(2)},
      headVariation
    );
    float k = max(1.0, pxFloor / max(px, 1e-4));
    p = (p - c) * k + c;
    vec4 world = modelMatrix * vec4(origin + p, 1.0);
    vec4 mv = viewMatrix * world;
    // Species tint stays shared across each clump. A separate position hash
    // lets the fragment make only a few individual heads into accents.
    vTint = instanceColor.r;
    vApron = instanceColor.b;
    vVariation = headVariation;
    vColorVariation = hash2(origin.zx * 61.3 + vec2(17.9, 5.3));
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
    vFog = fogAmount(${GRASS_FOG}, world.xyz, -mv.z) * 0.75 * uFogEnabled;
    vFogColor = domeBelow(world.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FLOWER_FRAGMENT = /* glsl */ `
  uniform float uDark;
  // The flowers declare their own uniforms rather than taking
  // SHARED_UNIFORMS_GLSL, and this one was missing: the retire fade writes
  // uOpacity into gl_FragColor below, so the program failed to compile and
  // WebGL logged "'uOpacity' : undeclared identifier" once per material.
  uniform float uOpacity;
  uniform float uSeat;
  uniform float uFogEnabled;
  #ifdef COORDINATION_ENVIRONMENT_FLICKER
    uniform float uEnvironmentFlicker;
  #endif
  uniform vec3 uFlowerA;
  uniform vec3 uFlowerB;
  uniform vec3 uFlowerC;
  uniform vec3 uFlowerRareA;
  uniform vec3 uFlowerRareB;
  uniform vec3 uNightA;
  uniform vec3 uNightB;
  uniform vec3 uNightRareA;
  uniform vec3 uNightRareB;
  varying float vTint;
  varying float vApron;
  varying float vVariation;
  varying float vColorVariation;
  varying float vSpin;
  varying float vPx;
  varying float vClamp;
  varying float vLamp;
  varying float vFog;
  varying vec2 vUv;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  void main() {
    if (vApron > 0.5 && uSeat > 0.001) discard;
    float rareStart = ${(1 - FLOWER_VARIATION.rareColorFraction).toFixed(3)};
    float rareSplit = ${(1 - FLOWER_VARIATION.rareColorFraction / 2).toFixed(4)};
    bool rareA = vColorVariation >= rareStart && vColorVariation < rareSplit;
    bool rareB = vColorVariation >= rareSplit;
    vec3 day = vTint < 0.55
      ? uFlowerA
      : (vTint < 0.75 ? uFlowerB : uFlowerC);
    if (rareA) day = uFlowerRareA;
    if (rareB) day = uFlowerRareB;
    day *= 0.92 + 0.16 * hash2(vec2(vTint, 7.7));
    // Moonlit lavender, deliberately dim — near-white heads read as paper
    // scraps at 3:45am. The crossfade rides the shared uDark clock.
    // (0.65/0.85 still glowed against the rosette shapes at the owner's
    // round-3 browse — "too bright in dark mode" — so night dropped to
    // 0.45 and the crossfade runs nearly full.)
    vec3 night = mix(uNightA, uNightB, step(0.5, vTint)) * 0.42;
    if (rareA) night = uNightRareA * 0.42;
    if (rareB) night = uNightRareB * 0.42;
    vec3 col = mix(day, night, uDark * 0.94);
    float headValue = mix(
      ${FLOWER_VARIATION.value[0].toFixed(2)},
      ${FLOWER_VARIATION.value[1].toFixed(2)},
      vVariation
    );
    vec3 headTemperature = mix(
      vec3(0.97, 1.00, 1.03),
      vec3(1.04, 1.00, 0.96),
      vVariation
    );
    col *= headValue * headTemperature;
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
    col = mix(col, vFogColor, max(vFog, vClamp * 0.85) * uFogEnabled);
    #ifdef COORDINATION_ENVIRONMENT_FLICKER
      col *= uEnvironmentFlicker;
    #endif
    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------

/** Flower head: one quad, Y-billboarded in the vertex shader, with the
 * per-clump species tint riding along as an instanced attribute. */
function makeFlowerGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -FLOWER_HW,
        0,
        0,
        FLOWER_HW,
        0,
        0,
        FLOWER_HW,
        FLOWER_H,
        0,
        -FLOWER_HW,
        FLOWER_H,
        0,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/** The lawn's floor at a given tessellation. MEADOW_TERRAIN's own segment
 * counts are the authored ceiling; content tiers pass coarser ones. */
function makeTerrainGeometry(
  segmentsX: number,
  segmentsZ: number,
): THREE.PlaneGeometry {
  const width = MEADOW_TERRAIN.maxX - MEADOW_TERRAIN.minX;
  const depth = MEADOW_TERRAIN.maxZ - MEADOW_TERRAIN.minZ;
  const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
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

function tuftMaxY(source: THREE.BufferGeometry) {
  source.computeBoundingBox();
  return Math.max(source.boundingBox!.max.y, 1e-4);
}

/** Clone a tuft LOD out of the GLB, height-normalized so position.y is the
 * 0→1 gate. X and Z use a capped correction against the full-detail tuft,
 * preserving coverage without stretching Safety's eight-card mesh into flat
 * fans. Per-instance lighting is owned by each tile's InstancedMesh so this
 * geometry stays shared by every tile. */
function prepareTuftGeometry(
  source: THREE.BufferGeometry,
  referenceMaxY: number,
): THREE.BufferGeometry {
  const geometry = source.clone();
  const scale = grassTuftNormalizationScale(tuftMaxY(geometry), referenceMaxY);
  geometry.scale(scale.x, scale.y, scale.z);
  return geometry;
}

/** Wind/poke lean happens in the vertex shader, after Three has computed the
 * instance bounds. 0.5 exceeds the grass's 0.28-radian maximum throw and the
 * flowers' two-pixel floor/wind displacement. */
function padInstanceBounds(mesh: THREE.InstancedMesh) {
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.boundingBox?.expandByScalar(0.5);
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.5;
}

/**
 * Terrain geometry, built at most once per content tier per mount.
 *
 * The first tier is built synchronously: there is no earlier floor to hold on
 * to, and the meadow cannot draw without one. Every later tier is built off
 * the critical path — never during a travel, and only once three consecutive
 * settled frames have fit inside the frame budget — while the currently bound
 * geometry stays on screen until the replacement exists. The five-second
 * escape hatch inside `nextTerrainBuildGate` is the important half of that
 * rule, and a tier already in the cache skips the gate entirely.
 *
 * It lives outside the component's `[]`-dep'd `built` memo on purpose: that
 * memo exists so a theme change eases through `uDark` instead of remounting,
 * and terrain LOD must not be able to give it a dependency.
 */
function useTerrainGeometry(tier: SceneContentTier) {
  const cacheRef = useRef<TerrainGeometryCache<THREE.PlaneGeometry> | null>(
    null,
  );
  cacheRef.current ??= createTerrainGeometryCache(makeTerrainGeometry);
  const cache = cacheRef.current;
  const [bound, setBound] = useState(() => ({
    tier,
    geometry: cache.get(tier),
  }));
  const gate = useRef<TerrainBuildGate>(IDLE_TERRAIN_BUILD_GATE);

  useEffect(() => () => cache.clear((geometry) => geometry.dispose()), [cache]);

  useFrame((_, delta) => {
    if (bound.tier === tier) {
      gate.current = IDLE_TERRAIN_BUILD_GATE;
      return;
    }
    const swap = () => {
      const geometry = cache.get(tier);
      gate.current = IDLE_TERRAIN_BUILD_GATE;
      setBound((current) =>
        current.tier === tier ? current : { tier, geometry },
      );
    };
    if (cache.has(tier)) {
      swap();
      return;
    }
    const step = nextTerrainBuildGate(gate.current, {
      pending: true,
      travelling: isSceneTraveling(),
      frameMs: delta * 1000,
      now: performance.now(),
    });
    gate.current = step.gate;
    if (step.build) swap();
  });

  return bound.geometry;
}

export default function Meadow({
  dark,
  rung = 3,
  farGrassShader = "simplified",
  grassDeformation = "off",
  contentTier = "full",
  environmentFlickerSignal = null,
  retiring = false,
  onRetired,
}: {
  dark: boolean;
  /** Quality rung (3 = full). Maps 1:1 onto MEADOW_RUNG_* counts; the
   * buffers' rung-stratified order makes each step a uniform density cut
   * across every band rather than a depth cut. */
  rung?: 0 | 1 | 2 | 3;
  /** Resolved visual policy. Performance experiments override the profile in
   * the quality resolver before this narrow scene slice reaches the meadow. */
  farGrassShader?: "full" | "simplified";
  /** Resolution and allocation policy for persistent physical marks. */
  grassDeformation?: MeadowDeformationQuality;
  /** Content axis. Moves tuft LOD, terrain tessellation and the near lawn's
   * wind shader — never the instance count, which stays at the rung. */
  contentTier?: SceneContentTier;
  /** Shared Coordination exposure fault. Null compiles the fragment work out. */
  environmentFlickerSignal?: MutableRefObject<number> | null;
  /** Fade the complete field before its parent releases every meadow-owned
   * allocation and per-frame subscription. */
  retiring?: boolean;
  onRetired?: () => void;
}) {
  const gl = useThree((state) => state.gl);
  const { cinematicPlus } = useSceneQualityControls();
  const freeRoam = useSyncExternalStore(
    freeRoamDiagnosticsController.subscribe,
    freeRoamDiagnosticsController.getSnapshot,
    freeRoamDiagnosticsController.getSnapshot,
  );
  const daylightCinematicPlus = cinematicPlus && !dark;
  const performanceSettings = useScenePerformanceSettings();
  const simplifiedFar = farGrassShader === "simplified";
  const [deformationOverride, setDeformationOverride] = useState<
    boolean | null
  >(null);
  const deformationEnabled = deformationOverride ?? grassDeformation !== "off";
  const effectiveDeformationQuality: MeadowDeformationQuality =
    deformationEnabled
      ? grassDeformation === "off"
        ? "lean"
        : grassDeformation
      : "off";
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const deformation = useMemo(
    () =>
      new MeadowDeformationController(
        gl,
        grassDeformation,
        prefersReducedMotion,
      ),
    // The controller resamples when quality changes. Rebuilding it would
    // throw away the mark the resample is meant to retain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gl, prefersReducedMotion],
  );
  const content = meadowContentPlan(contentTier);
  const terrainGeometry = useTerrainGeometry(contentTier);
  const maxPopulation = meadowTilePopulationLimit(performanceSettings);
  const nearRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const farRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const flowerRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  /** Dev-only density override: a 0..1 fraction of the full buffers that
   * beats the rung while set. Never written in production. */
  const densityRef = useRef<number | null>(null);
  const retireComplete = useRef(false);
  const onRetiredRef = useRef(onRetired);
  onRetiredRef.current = onRetired;

  const gltf = useGLTF(TUFT_URL, false);
  const alphaMap = useTexture(ALPHA_URL);

  const streams = useMemo(() => buildGrassInstances(), []);
  const flowers = useMemo(() => buildFlowerPositions(), []);
  const tiles = useMemo(
    () => ({
      near: buildMeadowTiles(
        streams.near,
        maxPopulation ? { maxPopulation } : undefined,
      ),
      far: buildMeadowTiles(
        streams.far,
        maxPopulation ? { maxPopulation } : undefined,
      ),
      flowers: buildMeadowTiles(
        flowers,
        maxPopulation ? { maxPopulation } : undefined,
      ),
    }),
    [streams, flowers, maxPopulation],
  );
  // `instanceColor` must exist when Three first compiles each ShaderMaterial:
  // it controls the prefix that declares the attribute. Build these before
  // render rather than attaching them in an effect, which would produce one
  // invalid first-frame program behind the boot curtain.
  const tileAttributes = useMemo(() => {
    const grass = (stream: typeof streams.near, tile: MeadowTile) => {
      const values = new Float32Array(tile.indices.length * 3);
      tile.indices.forEach((index, local) => {
        values[local * 3] = stream.sun[index]!;
        values[local * 3 + 1] = stream.shade[index]!;
        values[local * 3 + 2] = stream.band[index] === 4 ? 1 : 0;
      });
      return new THREE.InstancedBufferAttribute(values, 3);
    };
    const flower = (tile: MeadowTile) => {
      const values = new Float32Array(tile.indices.length * 3);
      tile.indices.forEach((index, local) => {
        values[local * 3] = flowers.tint[index]!;
        values[local * 3 + 1] = flowers.variation[index]!;
        values[local * 3 + 2] = flowers.apron[index]!;
      });
      return new THREE.InstancedBufferAttribute(values, 3);
    };
    return {
      near: tiles.near.map((tile) => grass(streams.near, tile)),
      far: tiles.far.map((tile) => grass(streams.far, tile)),
      flowers: tiles.flowers.map(flower),
    };
  }, [streams, flowers, tiles]);

  const built = useMemo(() => {
    const c = (hex: string) => new THREE.Color(hex);
    // ONE set of uniform holders — every material references the SAME
    // { value } objects, so each per-frame write updates all of them.
    const shared = {
      uTime: { value: 0 },
      uDark: { value: dark ? 1 : 0 },
      uOpacity: { value: 1 },
      uDawn: { value: 0 },
      uSeat: { value: 0 },
      uWindAmp: { value: MEADOW_WIND.amplitude as number },
      uWindSpeed: { value: MEADOW_WIND.speed as number },
      uFogEnabled: { value: 1 },
      uEnvironmentFlicker: { value: 1 },
      // skyShadow/dcWater come from PALETTES — never a duplicated hex.
      uShadowL: { value: c(PALETTES.light.skyShadow) },
      uShadowD: { value: c(PALETTES.dark.skyShadow) },
      uDcWaterL: { value: c(PALETTES.light.dcWater) },
      uDcWaterD: { value: c(PALETTES.dark.dcWater) },
      uBaseL: { value: c(PALETTES.light.meadowBase) },
      uBaseD: { value: c(PALETTES.dark.meadowBase) },
      uTipAL: { value: c(PALETTES.light.meadowTipA) },
      uTipAD: { value: c(PALETTES.dark.meadowTipA) },
      uTipBL: { value: c(PALETTES.light.meadowTipB) },
      uTipBD: { value: c(PALETTES.dark.meadowTipB) },
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
      uPoke: { value: new THREE.Vector4(0, 0, MEADOW_POKE.radius, 0) },
      uPokeF: { value: new THREE.Vector4(0, 0, MEADOW_POKE.radius, 0) },
      uPokeDir: { value: new THREE.Vector2() },
      uPulses: {
        value: Array.from(
          { length: MEADOW_PULSE_LAYERS },
          () => new THREE.Vector4(0, 0, 0, 0),
        ),
      },
    };
    const grassOnly = {
      uAlpha: { value: null as THREE.Texture | null },
    };
    const deformationOnly = {
      uDeformation: { value: null as THREE.Texture | null },
    };
    const flowerOnly = {
      uFlowerA: { value: c(COLORS.flowerA) },
      uFlowerB: { value: c(COLORS.flowerB) },
      uFlowerC: { value: c(COLORS.flowerC) },
      uFlowerRareA: { value: c(COLORS.flowerRareA) },
      uFlowerRareB: { value: c(COLORS.flowerRareB) },
      uNightA: { value: c(COLORS.nightA) },
      uNightB: { value: c(COLORS.nightB) },
      uNightRareA: { value: c(COLORS.nightRareA) },
      uNightRareB: { value: c(COLORS.nightRareB) },
      uPixelScale: { value: 1000 },
      uPxFloor: { value: 2.0 },
    };
    const shadowUniforms = () =>
      THREE.UniformsUtils.clone(THREE.UniformsLib.lights);
    return {
      shared,
      grassOnly,
      deformationOnly,
      flowerOnly,
      flowerGeometry: makeFlowerGeometry(),
      terrainMaterial: new THREE.ShaderMaterial({
        uniforms: {
          ...shadowUniforms(),
          ...shared,
          uSunDir: { value: SUN_DIR },
        },
        vertexShader: TERRAIN_VERTEX,
        fragmentShader: TERRAIN_FRAGMENT,
      }),
      // The tuft cards face every direction and cut out via discard —
      // DoubleSide + alpha test is the FluffyGrass technique; the opaque
      // FrontSide blade experiment is what the owner rejected.
      grassMaterial: new THREE.ShaderMaterial({
        uniforms: { ...shadowUniforms(), ...shared, ...grassOnly },
        vertexShader: meadowGrassVertexShader(false),
        fragmentShader: GRASS_FRAGMENT,
        side: THREE.DoubleSide,
      }),
      farGrassMaterial: new THREE.ShaderMaterial({
        uniforms: { ...shadowUniforms(), ...shared, ...grassOnly },
        vertexShader: meadowGrassVertexShader(false),
        fragmentShader: GRASS_FRAGMENT,
        side: THREE.DoubleSide,
        defines: { FAR_SIMPLE: 1 },
      }),
      deformedGrassMaterial: new THREE.ShaderMaterial({
        uniforms: {
          ...shadowUniforms(),
          ...shared,
          ...grassOnly,
          ...deformationOnly,
        },
        vertexShader: meadowGrassVertexShader(true),
        fragmentShader: GRASS_FRAGMENT,
        side: THREE.DoubleSide,
      }),
      deformedFarGrassMaterial: new THREE.ShaderMaterial({
        uniforms: {
          ...shadowUniforms(),
          ...shared,
          ...grassOnly,
          ...deformationOnly,
        },
        vertexShader: meadowGrassVertexShader(true),
        fragmentShader: GRASS_FRAGMENT,
        side: THREE.DoubleSide,
        defines: { FAR_SIMPLE: 1 },
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

  useEffect(() => {
    const materials = [
      built.terrainMaterial,
      built.grassMaterial,
      built.farGrassMaterial,
      built.deformedGrassMaterial,
      built.deformedFarGrassMaterial,
      built.flowerMaterial,
    ];
    retireComplete.current = false;
    if (!retiring) built.shared.uOpacity.value = 1;
    for (const material of materials) material.transparent = retiring;
  }, [built, retiring]);

  // ShaderMaterial does not opt into Three's light/shadow uniforms by
  // default. Switch that contract and its compile-time branch together so
  // Cinematic+ receives the directional map immediately, while every other
  // mode compiles out the sampler and getShadowMask call entirely.
  useLayoutEffect(() => {
    const materials = [
      built.terrainMaterial,
      built.grassMaterial,
      built.farGrassMaterial,
      built.deformedGrassMaterial,
      built.deformedFarGrassMaterial,
    ];
    for (const material of materials) {
      const defined = material.defines?.CINEMATIC_PLUS_SHADOWS === 1;
      if (
        material.lights === daylightCinematicPlus &&
        defined === daylightCinematicPlus
      )
        continue;
      material.lights = daylightCinematicPlus;
      material.defines ??= {};
      if (daylightCinematicPlus) material.defines.CINEMATIC_PLUS_SHADOWS = 1;
      else delete material.defines.CINEMATIC_PLUS_SHADOWS;
      material.needsUpdate = true;
    }
  }, [built, daylightCinematicPlus]);

  // The meadow is analytically lit, so Three's environment and room lights
  // cannot dim it. Compile this multiplication only while the approved
  // Coordination effect is live; the diagnostics-off shader has no branch or
  // per-fragment work for it.
  useLayoutEffect(() => {
    const enabled = environmentFlickerSignal !== null;
    const materials = [
      built.terrainMaterial,
      built.grassMaterial,
      built.farGrassMaterial,
      built.deformedGrassMaterial,
      built.deformedFarGrassMaterial,
      built.flowerMaterial,
    ];
    for (const material of materials) {
      const defined = material.defines?.COORDINATION_ENVIRONMENT_FLICKER === 1;
      if (defined === enabled) continue;
      material.defines ??= {};
      if (enabled) material.defines.COORDINATION_ENVIRONMENT_FLICKER = 1;
      else delete material.defines.COORDINATION_ENVIRONMENT_FLICKER;
      material.needsUpdate = true;
    }
    if (!enabled) built.shared.uEnvironmentFlicker.value = 1;
  }, [built, environmentFlickerSignal]);

  // The GLB's three tuft LODs — 66, 32 and 16 triangles — prepared once and
  // indexed by level. The near lawn picks by content tier; the mid + seated
  // bands always draw MEADOW_FAR_TUFT_LOD, so at the reduced tier the two
  // share one buffer rather than uploading the same mesh twice.
  const tuftLods = useMemo(() => {
    const sources: Array<THREE.BufferGeometry | null> = [null, null, null];
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (o.name.includes("LOD00")) sources[0] = mesh.geometry;
      if (o.name.includes("LOD01")) sources[1] = mesh.geometry;
      if (o.name.includes("LOD02")) sources[2] = mesh.geometry;
    });
    if (sources.some((source) => source === null)) {
      throw new Error("grass-tuft.glb is missing an LOD00/LOD01/LOD02 mesh");
    }
    const referenceMaxY = tuftMaxY(sources[0]!);
    return sources.map((source) => prepareTuftGeometry(source!, referenceMaxY));
  }, [gltf]);
  const nearTuftGeometry = tuftLods[content.nearTuftLod]!;
  const farTuftGeometry = tuftLods[content.farTuftLod]!;

  // The alpha mask is data, not color — keep it linear so the threshold
  // means the same thing the source texture authored.
  useEffect(() => {
    alphaMap.colorSpace = THREE.NoColorSpace;
    alphaMap.needsUpdate = true;
    built.grassOnly.uAlpha.value = alphaMap;
  }, [alphaMap, built]);

  useEffect(() => {
    built.shared.uFogEnabled.value = freeRoamFogVisible(freeRoam) ? 1 : 0;
    // The controller publishes a frozen snapshot and reuses it when nothing
    // moved, so depending on the object is as narrow as depending on its two
    // fields, and it cannot drift out of step with the policy.
  }, [built, freeRoam]);

  useEffect(() => {
    deformation.setQuality(effectiveDeformationQuality);
    built.deformationOnly.uDeformation.value = deformation.texture;
  }, [built, deformation, effectiveDeformationQuality]);

  useEffect(() => {
    const onVisibility = () => {
      if (deformationEnabled)
        deformation.tick(performance.now() / 1000, document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [deformation, deformationEnabled]);

  // Instance fill, once per tile. The matrices still point at meadowField's
  // exact authored placements; only their draw ownership changes. Each
  // tile keeps rung-major ordering locally and gets an actual instance
  // bound (plus shader-displacement padding), enabling normal frustum
  // culling without a per-frame CPU visibility walk.
  const scope = useWorldBootScope();
  useEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const fillGrassTile = (
      mesh: THREE.InstancedMesh | null,
      stream: typeof streams.near,
      tile: MeadowTile,
    ) => {
      if (!mesh) return;
      for (let local = 0; local < tile.indices.length; local++) {
        const i = tile.indices[local]!;
        position.set(stream.x[i]!, stream.y[i]!, stream.z[i]);
        euler.set(0, stream.yaw[i]!, 0);
        quaternion.setFromEuler(euler);
        const golf = suppressGolfVegetation(
          stream.x[i]!,
          stream.z[i]!,
          (Math.sin(i * 91.733) + 1) / 2,
        );
        scale.set(
          stream.width[i]! * golf.grassScale,
          stream.height[i]! * golf.grassHeightScale,
          stream.width[i]! * golf.grassScale,
        );
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(local, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      padInstanceBounds(mesh);
    };
    tiles.near.forEach((tile, i) =>
      fillGrassTile(nearRefs.current[i] ?? null, streams.near, tile),
    );
    tiles.far.forEach((tile, i) =>
      fillGrassTile(farRefs.current[i] ?? null, streams.far, tile),
    );
    tiles.flowers.forEach((tile, tileIndex) => {
      const mesh = flowerRefs.current[tileIndex];
      if (!mesh) return;
      quaternion.identity();
      for (let local = 0; local < tile.indices.length; local++) {
        const i = tile.indices[local]!;
        position.set(flowers.x[i]!, flowers.y[i]!, flowers.z[i]);
        const golf = suppressGolfVegetation(
          flowers.x[i]!,
          flowers.z[i]!,
          flowers.variation[i]!,
        );
        scale.setScalar(golf.flowers ? flowers.scale[i]! : 0);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(local, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      padInstanceBounds(mesh);
    });
    // The buffers are filled and the GLB/alpha suspended above us, so the
    // next painted frame contains grass — tell the boot reveal gate.
    scope.send({ type: "meadowReady" });
  }, [scope, streams, flowers, tiles]);

  // Instance bounds are derived from the matrices AND the bound geometry, so
  // a tuft LOD swap has to redo them. Refilling the matrices does not: the
  // placements are identical at every tier.
  useEffect(() => {
    for (const mesh of nearRefs.current) if (mesh) padInstanceBounds(mesh);
  }, [nearTuftGeometry]);

  // Live browse knobs on the house dev-hook object. Writes go straight into
  // the shared uniform holders, so every material follows at once; winning
  // values get baked into the defaults above. Zero production cost.
  useEffect(() => {
    const hooks = window.__stacks;
    if (!hooks) return;
    const apply = (update: MeadowDiagnosticsUpdate = {}) => {
      if (update.wind !== undefined) built.shared.uWindAmp.value = update.wind;
      if (update.speed !== undefined)
        built.shared.uWindSpeed.value = update.speed;
      if (update.density !== undefined) densityRef.current = update.density;
      if (update.deformationEnabled !== undefined) {
        const nextQuality: MeadowDeformationQuality = update.deformationEnabled
          ? grassDeformation === "off"
            ? "lean"
            : grassDeformation
          : "off";
        deformation.setQuality(nextQuality);
        built.deformationOnly.uDeformation.value = deformation.texture;
        setDeformationOverride(update.deformationEnabled);
      }
      return {
        wind: built.shared.uWindAmp.value,
        speed: built.shared.uWindSpeed.value,
        density: densityRef.current,
        deformationEnabled: update.deformationEnabled ?? deformationEnabled,
      };
    };
    hooks.meadow = meadowDiagnosticsController.update;
    meadowDiagnosticsController.connect(apply);
    return () => {
      if (hooks.meadow === meadowDiagnosticsController.update)
        delete hooks.meadow;
      meadowDiagnosticsController.disconnect(apply);
    };
  }, [built, deformation, deformationEnabled, grassDeformation]);

  // Click pulse for the pointer poke: stamped in the scene's own uTime
  // clock (written every frame below) so the pulse math never mixes time
  // bases. Any pointerdown counts — if the cursor is over a card the hit
  // point is hidden behind it anyway.
  const pokeClickAt = useRef(new Array<number>(MEADOW_PULSE_LAYERS).fill(-1));
  const pokeClickReach = useRef(new Array<number>(MEADOW_PULSE_LAYERS).fill(0));
  const pokeClickRadiusScale = useRef(
    new Array<number>(MEADOW_PULSE_LAYERS).fill(1),
  );
  const pokeClickTimeScale = useRef(
    new Array<number>(MEADOW_PULSE_LAYERS).fill(1),
  );
  const pokeClickAges = useRef(new Array<number>(MEADOW_PULSE_LAYERS).fill(-1));
  const pokeHit = useRef(new THREE.Vector2());
  const pokeHitReach = useRef(0);
  const pokePreviousHit = useRef(new THREE.Vector2());
  const pokePreviousPointer = useRef(new THREE.Vector2());
  const pokeGestureDirection = useRef(new THREE.Vector2());
  const pokeHasPrevious = useRef(false);
  const handledTouchPulseRevision = useRef(touchWorldRef.meadowPulseRevision);
  const handledImpactRevision = useRef(
    getMeadowDisturbance().physicalEvent.revision,
  );
  const bootAt = useRef(-1);
  const nextWindDiagnosticAt = useRef(0);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const slot = claimEffectLayer(
        pokeClickAt.current,
        built.shared.uTime.value,
        MEADOW_POKE.pulseDuration,
      );
      const pulse = built.shared.uPulses.value[slot]!;
      pulse.x = pokeHit.current.x;
      pulse.y = pokeHit.current.y;
      pokeClickReach.current[slot] = pokeHitReach.current;
      pokeClickRadiusScale.current[slot] = 1;
      pokeClickTimeScale.current[slot] = 1;
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [built]);

  useEffect(
    () => () => {
      resetMeadowDisturbance();
      sceneAudio.setWindLevel(0);
      built.flowerGeometry.dispose();
      built.terrainMaterial.dispose();
      built.grassMaterial.dispose();
      built.farGrassMaterial.dispose();
      built.deformedGrassMaterial.dispose();
      built.deformedFarGrassMaterial.dispose();
      built.flowerMaterial.dispose();
      deformation.dispose();
      // Terrain geometry belongs to the tier cache, which disposes its own.
      for (const lod of tuftLods) lod.dispose();
    },
    [built, deformation, tuftLods],
  );

  // The complete per-frame cost: shared uniform writes plus one cheap count
  // assignment per tile. Visibility itself remains Three's frustum test.
  useFrame(({ clock, gl, camera, pointer }, delta) => {
    const shared = built.shared;
    if (retiring) {
      shared.uOpacity.value = Math.max(
        0,
        shared.uOpacity.value - delta / MEADOW_RETIRE_SECONDS,
      );
      if (shared.uOpacity.value === 0 && !retireComplete.current) {
        retireComplete.current = true;
        onRetiredRef.current?.();
      }
    }
    const nowSeconds = performance.now() / 1000;
    const disturbance = getMeadowDisturbance();
    deformation.applyResetRevision(disturbance.resetRevision);
    // Pointer → lawn: unproject the cursor and hit the base ground plane
    // analytically (no raycaster, no geometry walk). Movement brushes a
    // trailing patch in the stroke direction; a click launches its own
    // outward ring. Coarse movement reuses these exact uniforms and draw
    // calls through the rAF-bounded Touch Wake signal.
    const touchWake = touchWorldRef.wakeStrength;
    handledImpactRevision.current = visitMeadowPhysicalEventsSince(
      handledImpactRevision.current,
      (event) => {
        const groundY = meadowHeight(event.endX, event.endZ);
        if (
          event.strength > 0 &&
          event.y <= groundY + MEADOW_IMPACT.groundTolerance
        ) {
          const directionLength = Math.hypot(
            event.directionX,
            event.directionZ,
          );
          const directionX =
            directionLength > 1e-5 ? event.directionX / directionLength : 0;
          const directionZ =
            directionLength > 1e-5 ? event.directionZ / directionLength : 0;
          const stampImpactPulse = (
            x: number,
            z: number,
            strengthScale: number,
          ) => {
            const slot = claimEffectLayer(
              pokeClickAt.current,
              clock.elapsedTime,
              MEADOW_POKE.pulseDuration,
            );
            const pulse = shared.uPulses.value[slot]!;
            pulse.x = x;
            pulse.y = z;
            pokeClickReach.current[slot] = event.strength * strengthScale;
            pokeClickRadiusScale.current[slot] =
              event.radius / MEADOW_POKE.pulseEndRadius;
            pokeClickTimeScale.current[slot] = event.timeScale;
          };
          stampImpactPulse(
            event.endX - directionX * MEADOW_IMPACT.directionOffset * 0.25,
            event.endZ - directionZ * MEADOW_IMPACT.directionOffset * 0.25,
            MEADOW_IMPACT.pulseStrengthScale,
          );
          if (directionLength > 1e-5)
            stampImpactPulse(
              event.endX - directionX * MEADOW_IMPACT.directionOffset * 1.25,
              event.endZ - directionZ * MEADOW_IMPACT.directionOffset * 1.25,
              MEADOW_IMPACT.wakeStrengthScale,
            );
          if (deformationEnabled) deformation.stamp(event, nowSeconds);
        }
      },
    );
    if (deformationEnabled) {
      deformation.tick(nowSeconds, document.hidden);
      built.deformationOnly.uDeformation.value = deformation.texture;
    }
    const touchPulsePending =
      handledTouchPulseRevision.current !== touchWorldRef.meadowPulseRevision;
    const touchMotionRunning =
      pokeClickAt.current.some((startedAt) => startedAt >= 0) ||
      shared.uPoke.value.w > 0.001 ||
      shared.uPokeF.value.w > 0.001;
    const touchInteractionActive =
      touchWake > 0.01 ||
      touchPulsePending ||
      (touchWorldRef.interactionPointerType === "touch" && touchMotionRunning);
    if (finePointer || touchInteractionActive) {
      const pointerX = touchInteractionActive
        ? touchWorldRef.pointerX
        : pointer.x;
      const pointerY = touchInteractionActive
        ? touchWorldRef.pointerY
        : pointer.y;
      const poke = shared.uPoke.value;
      pokeHitReach.current = 0;
      pokeScratch.set(pointerX, pointerY, 0.5).unproject(camera);
      pokeScratch.sub(camera.position).normalize();
      let target = 0;
      if (pokeScratch.y < -1e-3) {
        const tt = (MEADOW_GROUND_BASE - camera.position.y) / pokeScratch.y;
        if (tt > 0 && tt < 26) {
          const hx = camera.position.x + pokeScratch.x * tt;
          const hz = camera.position.z + pokeScratch.z * tt;
          const reach = meadowPokeStrength(hx, hz);
          pokeHit.current.set(hx, hz);
          pokeHitReach.current = reach;
          if (reach > 0) {
            const pointerMoved =
              !touchPulsePending &&
              pokeHasPrevious.current &&
              Math.hypot(
                pointerX - pokePreviousPointer.current.x,
                pointerY - pokePreviousPointer.current.y,
              ) >= MEADOW_POKE.pointerMoveEpsilon;
            if (pointerMoved) {
              const drag = meadowDragSample(
                pokePreviousHit.current.x,
                pokePreviousHit.current.y,
                hx,
                hz,
                delta,
                reach,
              );
              // Petals need the current gesture immediately. Grass keeps the
              // eased copy below so its broad lean does not chatter.
              pokeGestureDirection.current.set(
                drag.directionX,
                drag.directionZ,
              );
              target = drag.strength * (touchInteractionActive ? touchWake : 1);
              shared.uPokeDir.value.x = THREE.MathUtils.damp(
                shared.uPokeDir.value.x,
                drag.directionX,
                MEADOW_POKE.dragDirectionLambda,
                delta,
              );
              shared.uPokeDir.value.y = THREE.MathUtils.damp(
                shared.uPokeDir.value.y,
                drag.directionZ,
                MEADOW_POKE.dragDirectionLambda,
                delta,
              );
            }
            poke.x = THREE.MathUtils.damp(
              poke.x,
              hx,
              MEADOW_POKE.grassPositionLambda,
              delta,
            );
            poke.y = THREE.MathUtils.damp(
              poke.y,
              hz,
              MEADOW_POKE.grassPositionLambda,
              delta,
            );
            const pokeF = shared.uPokeF.value;
            pokeF.x = THREE.MathUtils.damp(
              pokeF.x,
              hx,
              MEADOW_POKE.flowerPositionLambda,
              delta,
            );
            pokeF.y = THREE.MathUtils.damp(
              pokeF.y,
              hz,
              MEADOW_POKE.flowerPositionLambda,
              delta,
            );
          }
          pokePreviousHit.current.set(hx, hz);
          pokePreviousPointer.current.set(pointerX, pointerY);
          pokeHasPrevious.current = true;
        } else {
          pokeHasPrevious.current = false;
        }
      } else {
        pokeHasPrevious.current = false;
      }
      if (touchPulsePending) {
        handledTouchPulseRevision.current = touchWorldRef.meadowPulseRevision;
        if (pokeHitReach.current > 0) {
          const slot = claimEffectLayer(
            pokeClickAt.current,
            clock.elapsedTime,
            MEADOW_POKE.pulseDuration,
          );
          const pulse = shared.uPulses.value[slot]!;
          pulse.x = pokeHit.current.x;
          pulse.y = pokeHit.current.y;
          pokeClickReach.current[slot] = pokeHitReach.current;
          pokeClickRadiusScale.current[slot] = 1;
          pokeClickTimeScale.current[slot] = 1;
        }
      }
      poke.w = THREE.MathUtils.damp(
        poke.w,
        target,
        target > poke.w
          ? MEADOW_POKE.grassAttackLambda
          : MEADOW_POKE.grassReleaseLambda,
        delta,
      );
      // Stems are lazier than blades: the flowers' strength eases at less
      // than half the grass rate, both bending and recovering.
      shared.uPokeF.value.w = THREE.MathUtils.damp(
        shared.uPokeF.value.w,
        target,
        target > shared.uPokeF.value.w
          ? MEADOW_POKE.flowerAttackLambda
          : MEADOW_POKE.flowerReleaseLambda,
        delta,
      );
      if (touchInteractionActive)
        touchWorldRef.wakeStrength = Math.max(0, touchWake - delta * 5);
    }
    const pulseAges = effectLayerAges(
      pokeClickAt.current,
      clock.elapsedTime,
      MEADOW_POKE.pulseDuration,
      pokeClickAges.current,
    );
    for (let index = 0; index < MEADOW_PULSE_LAYERS; index += 1) {
      const uniform = shared.uPulses.value[index]!;
      const age = pulseAges[index]!;
      if (age < 0) {
        uniform.w = 0;
        if (
          pokeClickAt.current[index]! >= 0 &&
          clock.elapsedTime - pokeClickAt.current[index]! >
            MEADOW_POKE.pulseDuration
        )
          pokeClickAt.current[index] = -1;
        continue;
      }
      const pulse = meadowPulseState(
        age * pokeClickTimeScale.current[index]!,
        pokeClickReach.current[index]!,
      );
      uniform.z = pulse.radius * pokeClickRadiusScale.current[index]!;
      uniform.w = pulse.strength;
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
    if (environmentFlickerSignal)
      shared.uEnvironmentFlicker.value = environmentFlickerSignal.current;
    // Boot gust: one wind swell sweeps the lawn as the reveal lands (the
    // meadow's first frames sit just ahead of it), then the amplitude
    // settles to the authored baseline and stops being written — the dev wind
    // knob owns it from there.
    if (bootAt.current < 0) bootAt.current = clock.elapsedTime;
    const since = clock.elapsedTime - bootAt.current;
    if (since < 6) {
      const g = Math.exp(-((since - 1.6) * (since - 1.6)) / 1.1);
      shared.uWindAmp.value =
        MEADOW_WIND.amplitude * (1 + MEADOW_WIND.bootBoost * g);
    }
    publishMeadowDisturbance({
      brush: shared.uPoke.value,
      direction: pokeGestureDirection.current,
      windAmplitude: shared.uWindAmp.value,
      pulses: shared.uPulses.value,
      pulseStarts: pokeClickAt.current,
    });
    // The amplitude uniform is only the field's ceiling. Sample the exact
    // traveling shader field near the camera so the audio and diagnostics
    // rise and fall with the gust the visitor is actually looking through.
    const liveWind = sampleMeadowWind(
      camera.position.x,
      camera.position.z - 4,
      clock.elapsedTime,
      shared.uWindAmp.value,
      shared.uWindSpeed.value,
    ).magnitude;
    sceneAudio.setWindLevel(meadowWindAudioLevel(liveWind));
    if (clock.elapsedTime >= nextWindDiagnosticAt.current) {
      meadowDiagnosticsController.publishLiveWind(liveWind);
      meadowDiagnosticsController.publishDeformation(deformation.getSnapshot());
      nextWindDiagnosticAt.current = clock.elapsedTime + 0.1;
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
        (1 +
          0.04 * Math.sin(lt * 11 + li * 7.3) +
          0.025 * Math.sin(lt * 27 + li * 2.1));
      li++;
    }
    for (; li < MEADOW_LAMP_MAX; li++) shared.uLampGlow.value[li] = 0;
    const density = densityRef.current;
    const countFor = (table: readonly number[]) =>
      meadowTileDrawCount(table, rung, density);
    tiles.near.forEach((tile, i) => {
      const mesh = nearRefs.current[i];
      if (mesh) mesh.count = countFor(tile.rungCounts);
    });
    tiles.far.forEach((tile, i) => {
      const mesh = farRefs.current[i];
      if (mesh) mesh.count = countFor(tile.rungCounts);
    });
    tiles.flowers.forEach((tile, i) => {
      const mesh = flowerRefs.current[i];
      if (mesh) mesh.count = countFor(tile.rungCounts);
    });
  });

  // Draw order terrain → grass → flowers.
  return (
    <StaticWorldRoot id="meadow-geometry">
      <mesh
        receiveShadow={daylightCinematicPlus}
        geometry={terrainGeometry}
        material={built.terrainMaterial}
      />
      {tiles.near.map((tile, i) => (
        <instancedMesh
          key={`near:${tile.key}`}
          ref={(mesh) => {
            nearRefs.current[i] = mesh;
          }}
          instanceColor={tileAttributes.near[i]}
          receiveShadow={daylightCinematicPlus}
          // Geometry and material are props, not constructor args: a content
          // tier must swap them in place. Remounting would drop the filled
          // instance matrices, which nothing refills.
          geometry={nearTuftGeometry}
          material={
            content.nearGrassSimplified
              ? deformationEnabled
                ? built.deformedFarGrassMaterial
                : built.farGrassMaterial
              : deformationEnabled
                ? built.deformedGrassMaterial
                : built.grassMaterial
          }
          args={[undefined, undefined, tile.indices.length]}
        />
      ))}
      {tiles.far.map((tile, i) => (
        <instancedMesh
          key={`far:${tile.key}`}
          ref={(mesh) => {
            farRefs.current[i] = mesh;
          }}
          instanceColor={tileAttributes.far[i]}
          receiveShadow={daylightCinematicPlus}
          geometry={farTuftGeometry}
          material={
            simplifiedFar
              ? deformationEnabled
                ? built.deformedFarGrassMaterial
                : built.farGrassMaterial
              : deformationEnabled
                ? built.deformedGrassMaterial
                : built.grassMaterial
          }
          args={[undefined, undefined, tile.indices.length]}
        />
      ))}
      {tiles.flowers.map((tile, i) => (
        <instancedMesh
          key={`flower:${tile.key}`}
          ref={(mesh) => {
            flowerRefs.current[i] = mesh;
          }}
          instanceColor={tileAttributes.flowers[i]}
          args={[
            built.flowerGeometry,
            built.flowerMaterial,
            tile.indices.length,
          ]}
        />
      ))}
    </StaticWorldRoot>
  );
}

useGLTF.preload(TUFT_URL, false);
// Without this the alpha texture only starts fetching when the component
// first renders — one Suspense round-trip later than the GLB, and exactly
// the kind of straggler the boot reveal used to race. Both assets now join
// the FIRST loading-manager batch at chunk eval.
useTexture.preload(ALPHA_URL);
