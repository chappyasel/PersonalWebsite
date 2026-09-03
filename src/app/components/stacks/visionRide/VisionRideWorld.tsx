"use client";

import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
import { useStacks } from "../store";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";

import { type EnvironmentBreath, environmentBreath } from "./visionRideBreath";
import {
  VISION_RIDE_CAMERA,
  VISION_RIDE_GRID_CELL_METRES,
  VISION_RIDE_GRID_HORIZON_METRES,
  VISION_RIDE_INTRO_SECONDS,
  arrivalPose,
  arrivalProgress,
  chaseAimY,
  chaseFraming,
  lateralReach,
} from "./visionRideCamera";
import {
  useVisionRideLightTrailsEnabled,
  useVisionRideMileMarkersEnabled,
  useVisionRideRetroFxEnabled,
} from "./visionRideDiagnostics";
import {
  VISION_RIDE_DRIVING,
  type VisionRideMotion,
  advanceDriveState,
  driveAxes,
  driveChaseOffsetMetres,
  driveSpeedMultiplier,
  driveVisualResponse,
  isVisionRideDriveKey,
} from "./visionRideDriving";
import {
  type LightRibbonSample,
  VISION_RIDE_LIGHT_TRAIL,
  lightRibbonPresentation,
  lightRibbonShouldRetainSample,
  lightTrailCarPose,
} from "./visionRideLightTrails";
import {
  VISION_RIDE_MILE_MARKER,
  checkpointShatterProgress,
  mileMarkerDigitSegments,
  mileMarkerPresentation,
} from "./visionRideMileMarker";
import { type VisionRidePalette, glslVec3 } from "./visionRidePalette";
import {
  VISION_RIDE_PARALLAX,
  chaseAimX,
  normalizedPointer,
  parallaxTarget,
} from "./visionRideParallax";
import type { VisionRideProfile } from "./visionRideProfiles";
import {
  VISION_RIDE_MOUNTAIN_FACET_DEPTH_METRES,
  VISION_RIDE_MOUNTAIN_FACET_WIDTH_METRES,
  VISION_RIDE_PERIOD_METRES,
  VISION_RIDE_ROAD_HALF_WIDTH,
  VISION_RIDE_STAR_FEATHER,
  VISION_RIDE_STAR_TWINKLE,
  VISION_RIDE_SUN_DEPTH_METRES,
  VISION_RIDE_SUN_DIAMETER_METRES,
  VISION_RIDE_SUN_ELEVATION_METRES,
  type VisionRideTerrainTier,
  deterministicStarSizes,
  deterministicStarTwinkle,
  deterministicStars,
  generateUnifiedLandscape,
  mountainWindowOffsets,
  visionRideTerrainSegments,
} from "./visionRideTerrain";
import { visionRideTouchRuntime } from "./visionRideTouch";

export const VISION_RIDE_CAR_URL =
  "/models/vision-ride-lamborghini.glb" as const;
export { VISION_RIDE_INTRO_SECONDS } from "./visionRideCamera";

export function preloadVisionRideAssets() {
  useGLTF.preload(VISION_RIDE_CAR_URL);
}

const SKY_VERTEX = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// The terrain fog calls this same function at full depth. Sharing the exact
// sky evaluation—not merely a similar purple—makes the final recycled mesh
// edge disappear instead of leaving a coloured silhouette against the dome.
const skyColorGlsl = (palette: VisionRidePalette) => `
  vec3 ditherSky(vec3 color) {
    float pattern = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y) * 2.0, 4.0);
    return floor(color * 40.0 + pattern * 0.25) / 40.0;
  }
  vec3 skyColor(float h, float breath) {
    float lift = breath * 0.03;
    vec3 indigo = ${glslVec3(palette.skyTop)};
    vec3 purple = ${glslVec3(palette.skyUpper)};
    vec3 violet = ${glslVec3(palette.skyViolet)};
    vec3 magenta = ${glslVec3(palette.skyMagenta)};
    vec3 pink = ${glslVec3(palette.skyPink)};
    vec3 coral = mix(${glslVec3(palette.skyHorizon)}, ${glslVec3(palette.skyHorizonCrest)}, breath);
    vec3 below = ${glslVec3(palette.skyBelow)};
    vec3 color = mix(pink, magenta, smoothstep(0.035, 0.11 + lift, h));
    color = mix(color, violet, smoothstep(0.11 + lift, 0.20 + lift, h));
    color = mix(color, purple, smoothstep(0.19 + lift, 0.32 + lift, h));
    color = mix(color, indigo, smoothstep(0.28, 0.48, h));
    color = mix(coral, color, smoothstep(0.0, 0.05, h));
    return mix(color, below, smoothstep(0.0, -0.08, h));
  }
`;

// Bands are placed for the sky that is actually on screen: near-black navy
// owns the upper frame, violet is only a short bridge into saturated magenta,
// and the horizon resolves decisively to orange. uBreath lifts those lower
// bands and warms the horizon slightly at the crest of the slow cycle.
const skyFragment = (palette: VisionRidePalette) => `
  varying vec3 vWorld;
  uniform float uBreath;
  ${skyColorGlsl(palette)}
  void main() {
    gl_FragColor = vec4(ditherSky(skyColor(vWorld.y, uBreath)), 1.0);
  }
`;

// Sizes are CSS pixels scaled by the device ratio and capped at 64, the
// smallest point size any target GPU guarantees. Twinkle rates come from the
// per-star phase so the field never pulses in unison; uMotion zeroes it
// under reduced motion.
const STAR_VERTEX = `
  attribute float aSize;
  attribute float aTwinkle;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uMotion;
  varying float vSize;
  varying float vTwinkle;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vSize = aSize;
    float rate = ${VISION_RIDE_STAR_TWINKLE.rateMin.toFixed(2)} + fract(aTwinkle * 0.618) * ${VISION_RIDE_STAR_TWINKLE.rateSpread.toFixed(2)};
    vTwinkle = ${VISION_RIDE_STAR_TWINKLE.floor.toFixed(2)} + ${VISION_RIDE_STAR_TWINKLE.depth.toFixed(2)} * sin(uTime * rate * uMotion + aTwinkle);
    gl_PointSize = min(64.0, aSize * uPixelRatio);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

// Three looks from one sprite: dust is a soft dot, the mid class gains a
// halo, and heroes add a four-point cross that decays along each arm. A
// radial feather takes everything to zero before the sprite's edge, so the
// cross arms fade out instead of clipping against the point's square.
const starFragment = (palette: VisionRidePalette) => `
  varying float vSize;
  varying float vTwinkle;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p);
    float bright = smoothstep(5.0, 7.0, vSize);
    float hero = smoothstep(12.0, 24.0, vSize);
    // Hero stars keep their long cross rays, but their white disc is half
    // the old radius (four times the Gaussian tightness).
    float tight = mix(mix(9.0, 45.0, bright), 440.0, hero);
    float core = exp(-r * r * tight);
    float halo = exp(-r * r * mix(10.0, 28.0, hero)) * (0.08 + 0.25 * bright + 0.08 * hero);
    vec2 a = abs(p);
    float rays = hero * 0.85 * (
      exp(-a.x * a.x * 1400.0) * exp(-a.y * 7.0) +
      exp(-a.y * a.y * 1400.0) * exp(-a.x * 7.0));
    float feather = 1.0 - smoothstep(${VISION_RIDE_STAR_FEATHER.start.toFixed(2)}, ${VISION_RIDE_STAR_FEATHER.end.toFixed(2)}, r);
    float alpha = (core + halo + rays) * vTwinkle * feather;
    if (alpha < 0.01) discard;
    vec3 color = mix(${glslVec3(palette.starCore)}, ${glslVec3(palette.starHero)}, hero * 0.5);
    gl_FragColor = vec4(color, min(alpha, 1.0));
  }
`;

const SUN_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunFragment = (
  palette: VisionRidePalette,
  style: VisionRideProfile["sunStyle"],
) => `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uMotion;
  vec3 dither(vec3 color) {
    float pattern = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y) * 2.0, 4.0);
    return floor(color * 28.0 + pattern * 0.25) / 28.0;
  }
  void main() {
    float distanceToCenter = length(vUv - 0.5);
    float disc = 1.0 - smoothstep(0.44, 0.458, distanceToCenter);
    float rimHalo = smoothstep(0.40, 0.445, distanceToCenter) *
      (1.0 - smoothstep(0.455, 0.5, distanceToCenter)) * 0.72;

    // A bright yellow crown rolls through peach into an electric pink foot.
    // Two blends keep the yellow upper third broad instead of muddying the
    // whole disc with a single yellow-to-magenta interpolation.
    vec3 top = ${glslVec3(palette.sunTop)};
    vec3 middle = ${glslVec3(palette.sunMiddle)};
    vec3 bottom = ${glslVec3(palette.sunFoot)};
    vec3 color = mix(bottom, middle, smoothstep(0.08, 0.52, vUv.y));
    color = mix(color, top, smoothstep(0.48, 0.78, vUv.y));

    // These are coloured scan bands painted inside an opaque disc, not alpha
    // holes. The reference never shows stars through the sun, and painting
    // the grooves prevents bloom from closing transparent gaps.
    float lower = 1.0 - vUv.y;
    // Solid yellow cap over the top third. Below it, each groove grows
    // gradually thicker toward the hot-pink foot.
    float stripeRegion = 1.0 - smoothstep(0.64, 0.70, vUv.y);
    // One band drifts upward roughly every three seconds. uMotion freezes the
    // scan pattern for visitors who prefer reduced motion.
    float bandPhase = fract((vUv.y + 0.018) * ${style.bandCount.toFixed(1)} - uTime * ${style.bandSpeed.toFixed(2)} * uMotion);
    float grooveWidth = mix(${style.grooveMin.toFixed(3)}, ${style.grooveMax.toFixed(3)}, smoothstep(0.30, 0.95, lower));
    float signedBand = bandPhase < 0.5 ? bandPhase : bandPhase - 1.0;
    float bandDistance = abs(signedBand);
    float halfGroove = grooveWidth * 0.5;
    float feather = max(fwidth(vUv.y * ${style.bandCount.toFixed(1)}) * 1.5, 0.018);
    float groove = 1.0 - smoothstep(
      halfGroove,
      halfGroove + feather,
      bandDistance
    );
    groove *= stripeRegion;
    vec3 grooveTop = ${glslVec3(palette.sunGrooveTop)};
    vec3 grooveBottom = ${glslVec3(palette.sunGrooveBottom)};
    vec3 grooveColor = mix(grooveBottom, grooveTop, smoothstep(0.2, 0.82, vUv.y));
    color = mix(color, grooveColor, groove * 0.64);

    // A soft warm upper lip and violet lower shadow make each moving band read
    // as a shallow recessed groove instead of a hard, flat vector cut.
    float bevelDistance = abs(bandDistance - halfGroove);
    float bevel = (1.0 - smoothstep(0.0, feather * 2.4, bevelDistance)) *
      stripeRegion;
    float upperBevel = bevel * smoothstep(-feather, feather, signedBand);
    float lowerBevel = bevel * (1.0 - smoothstep(-feather, feather, signedBand));
    color += ${glslVec3(palette.sunBevel)} * upperBevel * 0.16;
    color *= 1.0 - lowerBevel * 0.18;

    // Solid bands are HDR; painted grooves deliberately stay below the bloom
    // threshold. That preserves the scan pattern inside a large glowing sun.
    float crown = smoothstep(0.48, 0.9, vUv.y);
    float solidEmission = mix(1.28, 1.78, crown);
    float emission = mix(solidEmission, 0.82, groove * stripeRegion);
    vec3 sunColor = dither(color) * emission;
    gl_FragColor = vec4(sunColor, max(disc, rimHalo));
  }
`;

const sunGlowFragment = (palette: VisionRidePalette) => `
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float radius = length(p);
    float corona = pow(max(0.0, 1.0 - radius), 3.2);
    float outer = (1.0 - smoothstep(0.24, 1.0, radius)) * 0.18;
    float alpha = corona * 0.28 + outer * 0.08;
    if (alpha < 0.002) discard;
    vec3 pink = ${glslVec3(palette.sunFoot)};
    vec3 yellow = ${glslVec3(palette.sunTop)};
    vec3 color = mix(pink, yellow, smoothstep(0.25, 0.78, vUv.y));
    gl_FragColor = vec4(color * (0.44 + corona * 0.76), alpha);
  }
`;

const GRID_CELL_METRES = VISION_RIDE_GRID_CELL_METRES;

// Road and mountain fills use this exact screen-space mix. gl_FragCoord is
// measured in drawing-buffer pixels, so the matching viewport-height uniform
// keeps the gradient fixed to the frame across camera movement and DPR.
const surfaceGradientGlsl = (palette: VisionRidePalette) => `
  uniform float uViewportHeight;
  vec3 ditherSurface(vec3 color) {
    float pattern = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y) * 2.0, 4.0);
    return floor(color * 96.0 + pattern * 0.25) / 96.0;
  }
  vec3 surfaceColor() {
    float viewportY = gl_FragCoord.y / max(uViewportHeight, 1.0);
    float foreground = 1.0 - smoothstep(${palette.surfaceGradientBottom.toFixed(2)}, ${palette.surfaceGradientTop.toFixed(2)}, viewportY);
    return mix(${glslVec3(palette.surfaceBase)}, ${glslVec3(palette.surfaceBottom)}, foreground);
  }
`;

const landscapeVertex = (terrain: VisionRideProfile["terrain"]) => `
  varying vec2 vUv;
  varying vec2 vFacetUv;
  varying float vMountain;
  varying float vDepth;
  varying float vViewDepth;
  varying float vSkyHeight;
  void main() {
    // These are the mesh's own metre-grid coordinates. The road and mountain
    // vertices therefore cannot restart or drift apart at the shoulder.
    vUv = vec2(
      position.x / ${(GRID_CELL_METRES * terrain.gridCellXScale).toFixed(3)},
      -position.z / ${(GRID_CELL_METRES * terrain.gridCellYScale).toFixed(3)}
    );
    float outsideRoad = max(0.0, abs(position.x) - ${VISION_RIDE_ROAD_HALF_WIDTH.toFixed(1)});
    vFacetUv = vec2(
      outsideRoad / ${VISION_RIDE_MOUNTAIN_FACET_WIDTH_METRES.toFixed(3)},
      -position.z / ${VISION_RIDE_MOUNTAIN_FACET_DEPTH_METRES.toFixed(3)}
    );
    vMountain = smoothstep(0.15, 1.5, outsideRoad);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * world;
    vViewDepth = max(0.0, -viewPosition.z);
    vSkyHeight = normalize(world.xyz - cameraPosition).y;
    vDepth = clamp(vViewDepth / ${VISION_RIDE_GRID_HORIZON_METRES.toFixed(1)}, 0.0, 1.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

// The floor shares one viewport gradient with the mountain fill, with the
// cyan wire on top.
// Lines dim with distance before fwidth would fuse them into a solid blue
// plane. The shared dither keeps both dark surfaces in the same bands.
const landscapeFragment = (
  palette: VisionRidePalette,
  lineWidthPx: number,
  lineOpacity: number,
) => `
  varying vec2 vUv;
  varying vec2 vFacetUv;
  varying float vMountain;
  varying float vDepth;
  varying float vViewDepth;
  varying float vSkyHeight;
  uniform float uBreath;
  ${skyColorGlsl(palette)}
  ${surfaceGradientGlsl(palette)}
  void main() {
    // fwidth converts the metric grid into screen derivatives, so this is a
    // constant pixel width from the foreground through the horizon.
    vec2 cell = abs(fract(vUv + 0.5) - 0.5) / max(fwidth(vUv) * ${lineWidthPx.toFixed(2)}, vec2(0.001));
    float edge = min(min(cell.x, cell.y), 4.0);
    float distanceFade = 1.0 - smoothstep(0.35, 0.95, vDepth);
    float line = (1.0 - min(edge, 1.0)) * distanceFade;
    // Show the actual coarse triangular faces on the mountain flanks. The
    // metre grid remains continuous underneath, while these diagonal edges
    // expose the large low-poly planes present in the reference.
    vec2 facet = fract(vFacetUv);
    vec2 facetBoundary = min(facet, 1.0 - facet) /
      max(fwidth(vFacetUv) * ${lineWidthPx.toFixed(2)}, vec2(0.001));
    float diagonal = abs(facet.x + facet.y - 1.0) /
      max(fwidth(vFacetUv.x + vFacetUv.y) * ${lineWidthPx.toFixed(2)}, 0.001);
    float facetEdge = min(min(facetBoundary.x, facetBoundary.y), diagonal);
    float facetLine = (1.0 - min(facetEdge, 1.0)) * vMountain * distanceFade;
    line = max(line, facetLine);
    float glow = max(0.0, 1.0 - edge * 0.5) * 0.06;
    vec3 base = surfaceColor();
    vec3 neon = ${glslVec3(palette.roadLine)};
    float wire = max(line, glow) * ${lineOpacity.toFixed(2)};
    vec3 color = mix(base, neon, wire);
    // Custom view-space fog is intentional: the parent scene's short-range
    // room fog is not calibrated for this 190 m chase. Applying it here also
    // guarantees the road and both mountain flanks haze as one surface.
    float fogAmount = smoothstep(
      ${palette.surfaceFogNear.toFixed(1)},
      ${palette.surfaceFogFar.toFixed(1)},
      vViewDepth
    ) * ${palette.surfaceFogMax.toFixed(2)};
    vec3 paintedSurface = ditherSurface(color);
    vec3 paintedSky = ditherSky(skyColor(vSkyHeight, uBreath));
    gl_FragColor = vec4(mix(paintedSurface, paintedSky, fogAmount), 1.0);
  }
`;

// Clip-space fullscreen quad, immune to the camera near plane: the old
// camera-tracked plane at z=-0.075 was entirely clipped by Three's default
// near=0.1, so the CRT texture never actually rendered.
const SCREEN_TEXTURE_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const SCREEN_TEXTURE_FRAGMENT = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uMotion;
  uniform float uDriveTint;
  float noise(vec2 point) {
    return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
  }
  void main() {
    vec2 pixel = floor(gl_FragCoord.xy / 2.0);
    float checker = mod(pixel.x + pixel.y, 2.0);
    float scanPhase = fract((gl_FragCoord.y + uTime * uMotion * 7.0) / 4.0);
    float scanline = smoothstep(0.34, 0.92, scanPhase);
    vec2 centered = (vUv - 0.5) * 2.0;
    float vignette = smoothstep(0.48, 1.36, dot(centered, centered));
    float flicker = uMotion * (0.5 + 0.5 * sin(uTime * 47.0));
    float grain = noise(pixel + floor(uTime * uMotion * 18.0));

    // A restrained RGB phosphor grille keeps flat fills from looking digitally
    // perfect without turning the ride into a novelty CRT filter.
    float phosphorCell = mod(floor(gl_FragCoord.x), 3.0);
    vec3 phosphor = phosphorCell < 1.0
      ? vec3(0.10, 0.018, 0.035)
      : phosphorCell < 2.0
        ? vec3(0.018, 0.07, 0.055)
        : vec3(0.035, 0.025, 0.12);
    float alpha = 0.012 + checker * 0.024 + scanline * 0.044 +
      vignette * 0.19 + flicker * 0.008 + grain * 0.018;
    vec3 accelerationTint = vec3(0.0, 0.009, 0.022);
    vec3 brakingTint = vec3(0.016, 0.002, -0.003);
    vec3 driveTint = uDriveTint >= 0.0 ? accelerationTint : brakingTint;
    vec3 tint = vec3(0.008, 0.0, 0.022) + phosphor * 0.48 +
      driveTint * abs(uDriveTint);
    gl_FragColor = vec4(tint, alpha);
  }
`;

const LIGHT_RIBBON_VERTEX = `
  attribute float aEmitterSpan;
  attribute float aBloomLayer;
  attribute float aOpacity;
  varying float vEmitterSpan;
  varying float vBloomLayer;
  varying float vOpacity;

  void main() {
    vEmitterSpan = aEmitterSpan;
    vBloomLayer = aBloomLayer;
    vOpacity = aOpacity;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const LIGHT_RIBBON_FRAGMENT = `
  uniform vec3 uColor;
  varying float vEmitterSpan;
  varying float vBloomLayer;
  varying float vOpacity;

  void main() {
    float distanceAlongEmitter = abs(vEmitterSpan);
    float filament = 1.0 - smoothstep(0.84, 1.03, distanceAlongEmitter);
    float softEdge = 1.0 - smoothstep(0.58, 1.43, distanceAlongEmitter);
    float layerMix = min(1.0, vBloomLayer * 0.5);
    float edgeProfile = mix(filament, softEdge, layerMix);
    float layerAlpha = vBloomLayer < 0.5
      ? 0.16
      : vBloomLayer < 1.5
        ? 0.06
        : 0.018;
    float alpha = edgeProfile * layerAlpha * vOpacity;
    if (alpha < 0.001) discard;
    vec3 hotCore = mix(
      uColor * 1.35,
      vec3(1.0, 0.72, 0.90) * 2.05,
      filament * 0.48
    );
    vec3 color = vBloomLayer < 0.5 ? hotCore : uColor * 1.08;
    gl_FragColor = vec4(color, alpha);
  }
`;

// Render order. Sky, stars and sun draw first and write no depth, so the
// terrain always paints over them: the sun cannot come forward of a ridge at
// any travel phase, and a star can never sit in front of a mountain. The
// sun, mountain fill and wire use transparency; render and depth ordering
// keep that stack deterministic ahead of the car's glass.
const ORDER = {
  sky: -3,
  stars: -2,
  sun: -1,
  mountains: -1,
  dither: 9_000,
} as const;

const VISION_RIDE_FRAME_PRIORITY = {
  motion: -10,
  camera: -5,
  lightTrails: 0,
} as const;

const SKY_SPHERE_RADIUS = 420;

function ScreenDitherOverlay({
  reducedMotion,
  motion,
}: {
  reducedMotion: boolean;
  motion: RefObject<VisionRideMotion>;
}) {
  const material = useRef<THREE.ShaderMaterial>(null);
  useFrame((state) => {
    if (material.current) {
      material.current.uniforms.uTime!.value = state.clock.elapsedTime;
      material.current.uniforms.uDriveTint!.value = driveVisualResponse(
        motion.current.throttle,
      );
    }
  });
  return (
    <mesh frustumCulled={false} renderOrder={ORDER.dither}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        uniforms={{
          uTime: { value: 0 },
          uMotion: { value: reducedMotion ? 0 : 1 },
          uDriveTint: { value: 0 },
        }}
        vertexShader={SCREEN_TEXTURE_VERTEX}
        fragmentShader={SCREEN_TEXTURE_FRAGMENT}
      />
    </mesh>
  );
}

function RetrowaveSky({
  starCount,
  reducedMotion,
  breath,
  profile,
}: {
  starCount: number;
  reducedMotion: boolean;
  breath: RefObject<EnvironmentBreath>;
  profile: VisionRideProfile;
}) {
  const stars = useMemo(() => deterministicStars(starCount), [starCount]);
  const starSizes = useMemo(
    () => deterministicStarSizes(starCount),
    [starCount],
  );
  const starTwinkle = useMemo(
    () => deterministicStarTwinkle(starCount),
    [starCount],
  );
  const dpr = useThree((state) => state.viewport.dpr);
  const skyMaterial = useRef<THREE.ShaderMaterial>(null);
  const starMaterial = useRef<THREE.ShaderMaterial>(null);
  const sunMaterial = useRef<THREE.ShaderMaterial>(null);
  const sun = useRef<THREE.Group>(null);
  const skyShader = useMemo(
    () => skyFragment(profile.palette),
    [profile.palette],
  );
  const starsShader = useMemo(
    () => starFragment(profile.palette),
    [profile.palette],
  );
  const discShader = useMemo(
    () => sunFragment(profile.palette, profile.sunStyle),
    [profile.palette, profile.sunStyle],
  );
  const glowShader = useMemo(
    () => sunGlowFragment(profile.palette),
    [profile.palette],
  );
  useFrame((state) => {
    const cycle = breath.current;
    if (skyMaterial.current)
      skyMaterial.current.uniforms.uBreath!.value = cycle.phase;
    if (starMaterial.current) {
      starMaterial.current.uniforms.uTime!.value = state.clock.elapsedTime;
      starMaterial.current.uniforms.uPixelRatio!.value = dpr;
    }
    if (sunMaterial.current)
      sunMaterial.current.uniforms.uTime!.value = state.clock.elapsedTime;
    if (sun.current)
      sun.current.scale.setScalar(cycle.sunScale * profile.sunBaseScale);
  });
  return (
    <>
      <mesh
        scale={SKY_SPHERE_RADIUS}
        frustumCulled={false}
        renderOrder={ORDER.sky}
      >
        <sphereGeometry args={[1, 32, 18]} />
        <shaderMaterial
          key={skyShader}
          ref={skyMaterial}
          side={THREE.BackSide}
          depthWrite={false}
          toneMapped={false}
          uniforms={{ uBreath: { value: 0 } }}
          vertexShader={SKY_VERTEX}
          fragmentShader={skyShader}
        />
      </mesh>
      <points frustumCulled={false} renderOrder={ORDER.stars}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[starSizes, 1]} />
          <bufferAttribute
            attach="attributes-aTwinkle"
            args={[starTwinkle, 1]}
          />
        </bufferGeometry>
        <shaderMaterial
          key={starsShader}
          ref={starMaterial}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
            uPixelRatio: { value: dpr },
            uMotion: { value: reducedMotion ? 0 : 1 },
          }}
          vertexShader={STAR_VERTEX}
          fragmentShader={starsShader}
        />
      </points>
      <group
        ref={sun}
        position={[
          0,
          VISION_RIDE_SUN_ELEVATION_METRES,
          -VISION_RIDE_SUN_DEPTH_METRES,
        ]}
        renderOrder={ORDER.sun}
      >
        <mesh renderOrder={ORDER.sun - 0.1}>
          <planeGeometry
            args={[
              VISION_RIDE_SUN_DIAMETER_METRES * 1.5,
              VISION_RIDE_SUN_DIAMETER_METRES * 1.5,
            ]}
          />
          <shaderMaterial
            key={glowShader}
            transparent
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            vertexShader={SUN_VERTEX}
            fragmentShader={glowShader}
          />
        </mesh>
        <mesh renderOrder={ORDER.sun}>
          <planeGeometry
            args={[
              VISION_RIDE_SUN_DIAMETER_METRES,
              VISION_RIDE_SUN_DIAMETER_METRES,
            ]}
          />
          {/* Three.js only honors the circular alpha and painted scan bands
              when this material participates in the transparent queue.
              Explicit ordering still keeps the disc behind the terrain. */}
          <shaderMaterial
            key={discShader}
            ref={sunMaterial}
            transparent
            depthWrite={false}
            toneMapped={false}
            blending={THREE.CustomBlending}
            blendSrc={THREE.SrcAlphaFactor}
            blendDst={THREE.OneMinusSrcAlphaFactor}
            uniforms={{
              uTime: { value: 0 },
              uMotion: { value: reducedMotion ? 0 : 1 },
            }}
            vertexShader={SUN_VERTEX}
            fragmentShader={discShader}
          />
        </mesh>
      </group>
    </>
  );
}

function UnifiedLandscape({
  reducedMotion,
  breath,
  profile,
  motion,
}: {
  reducedMotion: boolean;
  breath: RefObject<EnvironmentBreath>;
  profile: VisionRideProfile;
  motion: RefObject<VisionRideMotion>;
}) {
  const near = useRef<THREE.Mesh>(null);
  const middle = useRef<THREE.Mesh>(null);
  const horizon = useRef<THREE.Mesh>(null);
  const viewportHeight = useThree(
    (state) => state.size.height * state.viewport.dpr,
  );
  const landscape = useMemo(() => generateUnifiedLandscape(), []);
  const geometry = useMemo(() => {
    const built = new THREE.BufferGeometry();
    built.setAttribute(
      "position",
      new THREE.BufferAttribute(landscape.samples, 3),
    );
    built.setIndex(new THREE.BufferAttribute(landscape.surfaceIndices, 1));
    return built;
  }, [landscape]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        toneMapped: false,
        uniforms: {
          uViewportHeight: { value: viewportHeight },
          uBreath: { value: 0 },
        },
        vertexShader: landscapeVertex(profile.terrain),
        fragmentShader: landscapeFragment(
          profile.palette,
          profile.terrain.lineWidthPx,
          profile.terrain.lineOpacity,
        ),
      }),
    [profile.palette, profile.terrain, viewportHeight],
  );

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    material.uniforms.uBreath!.value = breath.current.phase;
    const travel = reducedMotion ? 0 : motion.current.travelDistanceMetres;
    const [nearOffset, middleOffset, horizonOffset] =
      mountainWindowOffsets(travel);
    if (near.current) near.current.position.z = nearOffset;
    if (middle.current) middle.current.position.z = middleOffset;
    if (horizon.current) horizon.current.position.z = horizonOffset;
  });

  return (
    <>
      <mesh
        ref={near}
        geometry={geometry}
        material={material}
        position={[0, -0.02, 0]}
        scale={[1, profile.terrain.heightScale, 1]}
        frustumCulled={false}
        renderOrder={ORDER.mountains}
      />
      <mesh
        ref={middle}
        geometry={geometry}
        material={material}
        position={[0, -0.02, -VISION_RIDE_PERIOD_METRES]}
        scale={[1, profile.terrain.heightScale, 1]}
        frustumCulled={false}
        renderOrder={ORDER.mountains}
      />
      <mesh
        ref={horizon}
        geometry={geometry}
        material={material}
        position={[0, -0.02, -VISION_RIDE_PERIOD_METRES * 2]}
        scale={[1, profile.terrain.heightScale, 1]}
        frustumCulled={false}
        renderOrder={ORDER.mountains}
      />
    </>
  );
}

const MILE_MARKER_SEGMENTS = {
  a: [0, 0.34, 0.32, 0.045],
  b: [0.18, 0.18, 0.045, 0.28],
  c: [0.18, -0.18, 0.045, 0.28],
  d: [0, -0.34, 0.32, 0.045],
  e: [-0.18, -0.18, 0.045, 0.28],
  f: [-0.18, 0.18, 0.045, 0.28],
  g: [0, 0, 0.32, 0.045],
} as const;

const CHECKPOINT_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CHECKPOINT_FRAGMENT = `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uProgress;
  uniform float uIntegrity;

  void main() {
    float edgeX = smoothstep(0.0, 0.08, vUv.x) *
      (1.0 - smoothstep(0.92, 1.0, vUv.x));
    float edgeY = smoothstep(0.0, 0.06, vUv.y) *
      (1.0 - smoothstep(0.94, 1.0, vUv.y));
    float scan = smoothstep(
      0.78,
      1.0,
      0.5 + 0.5 * sin(vUv.y * 150.0 - uTime * 8.0)
    );
    float columns = smoothstep(
      0.9,
      1.0,
      0.5 + 0.5 * sin(vUv.x * 92.0)
    );
    float sweepPosition = fract(uTime * 0.18 + uProgress * 0.35);
    float sweep = exp(-pow((vUv.y - sweepPosition) * 18.0, 2.0));
    float pulse = 0.88 + 0.12 * sin(uTime * 4.0);
    float alpha = (0.018 + scan * 0.055 + columns * 0.025 + sweep * 0.14) *
      edgeX * edgeY * pulse * uIntegrity;
    if (alpha < 0.006) discard;
    gl_FragColor = vec4(uColor * (1.5 + sweep * 1.8), alpha);
  }
`;

const CHECKPOINT_SHARD_COLUMNS = 9;
const CHECKPOINT_SHARD_ROWS = 4;
const CHECKPOINT_SHARD_COUNT =
  CHECKPOINT_SHARD_COLUMNS * CHECKPOINT_SHARD_ROWS * 2;
const CHECKPOINT_SHARD_VERTICES = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0,
]);

type CheckpointShardTransform = {
  matrix: THREE.Matrix4;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
};

function writeCheckpointShards(
  mesh: THREE.InstancedMesh,
  progress: number,
  impactX: number,
  transform: CheckpointShardTransform,
) {
  const span = VISION_RIDE_ROAD_HALF_WIDTH * 2 + 0.25;
  const height = VISION_RIDE_MILE_MARKER.heightMetres - 0.14;
  const cellWidth = span / CHECKPOINT_SHARD_COLUMNS;
  const cellHeight = height / CHECKPOINT_SHARD_ROWS;
  const burst = 1 - (1 - progress) ** 3;
  const shrink = 1 - THREE.MathUtils.smoothstep(progress, 0.62, 1) * 0.76;
  let instance = 0;

  for (let row = 0; row < CHECKPOINT_SHARD_ROWS; row += 1) {
    for (let column = 0; column < CHECKPOINT_SHARD_COLUMNS; column += 1) {
      const baseX = -span / 2 + (column + 0.5) * cellWidth;
      const baseY = 0.07 + (row + 0.5) * cellHeight;
      for (let triangle = 0; triangle < 2; triangle += 1) {
        const seed = ((instance * 47 + 19) % 101) / 101;
        const radialX = baseX - impactX;
        transform.position.set(
          baseX + (radialX * 0.24 + (seed - 0.5) * 0.34) * burst * 3.2,
          baseY + ((baseY - 0.78) * 0.26 + seed * 0.28) * burst * 3.2,
          (0.35 + seed * 0.82) * burst * 2.4,
        );
        transform.rotation.set(
          (seed - 0.5) * burst * 3.4,
          (0.5 - seed) * burst * 4.1,
          triangle * Math.PI + (seed - 0.5) * burst * 3.8,
        );
        transform.quaternion.setFromEuler(transform.rotation);
        transform.scale.set(cellWidth * shrink, cellHeight * shrink, 1);
        transform.matrix.compose(
          transform.position,
          transform.quaternion,
          transform.scale,
        );
        mesh.setMatrixAt(instance, transform.matrix);
        instance += 1;
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function writeCheckpointInstances(
  mesh: THREE.InstancedMesh,
  number: number,
  matrix: THREE.Matrix4,
) {
  let instance = 0;
  const write = (
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    rotationZ = 0,
  ) => {
    matrix.makeRotationZ(rotationZ);
    matrix.scale(new THREE.Vector3(width, height, depth));
    matrix.setPosition(x, y, z);
    mesh.setMatrixAt(instance, matrix);
    instance += 1;
  };

  const marker = VISION_RIDE_MILE_MARKER;
  const edge = VISION_RIDE_ROAD_HALF_WIDTH + 0.16;
  const width = edge * 2;
  for (const z of [-marker.depthMetres / 2, marker.depthMetres / 2]) {
    write(-edge, marker.heightMetres / 2, z, 0.075, marker.heightMetres, 0.07);
    write(edge, marker.heightMetres / 2, z, 0.075, marker.heightMetres, 0.07);
    write(0, marker.heightMetres, z, width, 0.075, 0.07);
    write(0, 0.055, z, width, 0.035, 0.07);
  }
  for (const x of [-edge, 0, edge]) {
    write(x, marker.heightMetres, 0, 0.075, 0.075, marker.depthMetres);
    write(x, 0.055, 0, 0.075, 0.035, marker.depthMetres);
  }

  // Seven shallow chevrons hang across the full lane width. The hologram
  // curtain supplies the surface; these bars give it a readable 3D spine.
  for (let arrow = -3; arrow <= 3; arrow += 1) {
    const x = arrow * 1.08;
    write(x - 0.13, 2.34, 0, 0.34, 0.055, 0.07, Math.PI / 4);
    write(x + 0.13, 2.34, 0, 0.34, 0.055, 0.07, -Math.PI / 4);
  }

  const digits = mileMarkerDigitSegments(number);
  for (let digit = 0; digit < digits.length; digit += 1) {
    const originX = -0.24 + digit * 0.48;
    for (const segment of digits[digit]!) {
      const [x, y, width, height] =
        MILE_MARKER_SEGMENTS[segment as keyof typeof MILE_MARKER_SEGMENTS];
      write(originX + x, 1.45 + y, -0.245, width, height, 0.055);
    }
  }
  mesh.count = instance;
  mesh.instanceMatrix.needsUpdate = true;
}

function HolographicCheckpoint({
  active,
  reducedMotion,
  profile,
  motion,
}: {
  active: boolean;
  reducedMotion: boolean;
  profile: VisionRideProfile;
  motion: RefObject<VisionRideMotion>;
}) {
  const group = useRef<THREE.Group>(null);
  const segments = useRef<THREE.InstancedMesh>(null);
  const frameMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const curtain = useRef<THREE.ShaderMaterial>(null);
  const shards = useRef<THREE.InstancedMesh>(null);
  const shardMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const markerMatrix = useMemo(() => new THREE.Matrix4(), []);
  const shardTransform = useMemo<CheckpointShardTransform>(
    () => ({
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      rotation: new THREE.Euler(),
    }),
    [],
  );
  const displayedNumber = useRef(-1);
  const startedAt = useRef<number | null>(null);
  const checkpoint = useRef({ number: 0, travelDistanceMetres: 0 });
  const previousShatter = useRef(0);
  const shatterImpactX = useRef(0);

  useLayoutEffect(() => {
    if (!segments.current) return;
    writeCheckpointInstances(segments.current, 0, markerMatrix);
  }, [markerMatrix]);

  useFrame((state) => {
    if (!group.current) return;
    if (!active) {
      startedAt.current = null;
      checkpoint.current.number = 0;
      previousShatter.current = 0;
      group.current.visible = false;
      return;
    }
    startedAt.current ??= state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startedAt.current;
    const number = Math.floor(elapsed / VISION_RIDE_MILE_MARKER.periodSeconds);
    if (number > 0 && checkpoint.current.number !== number) {
      checkpoint.current.number = number;
      checkpoint.current.travelDistanceMetres =
        motion.current.travelDistanceMetres;
    }
    const beat = mileMarkerPresentation(
      elapsed,
      motion.current.travelDistanceMetres -
        checkpoint.current.travelDistanceMetres,
      reducedMotion,
    );
    group.current.visible = beat.visible;
    group.current.position.set(0, 0, beat.z);
    const impactZ =
      VISION_RIDE_CAMERA.carZ - VISION_RIDE_CAMERA.carLengthMetres / 2;
    const shatter = checkpointShatterProgress(beat.z, impactZ);
    if (shatter > 0 && previousShatter.current === 0)
      shatterImpactX.current =
        motion.current.steering * VISION_RIDE_DRIVING.steeringOffsetMetres;
    previousShatter.current = shatter;
    if (curtain.current) {
      curtain.current.uniforms.uTime!.value = state.clock.elapsedTime;
      curtain.current.uniforms.uProgress!.value = beat.progress;
      curtain.current.uniforms.uIntegrity!.value =
        1 - THREE.MathUtils.smoothstep(shatter, 0, 0.72);
    }
    if (frameMaterial.current)
      frameMaterial.current.opacity =
        0.86 * (1 - THREE.MathUtils.smoothstep(shatter, 0.42, 1) * 0.76);
    if (shards.current && shardMaterial.current) {
      const visible = shatter > 0 && shatter < 1;
      shards.current.visible = visible;
      if (visible) {
        writeCheckpointShards(
          shards.current,
          shatter,
          shatterImpactX.current,
          shardTransform,
        );
        shardMaterial.current.opacity = Math.sin(shatter * Math.PI) * 0.58;
      }
    }
    if (
      beat.visible &&
      segments.current &&
      displayedNumber.current !== beat.number
    ) {
      displayedNumber.current = beat.number;
      writeCheckpointInstances(segments.current, beat.number, markerMatrix);
    }
  });

  return (
    <group ref={group} visible={false}>
      <instancedMesh
        ref={segments}
        args={[undefined, undefined, 48]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          ref={frameMaterial}
          color={profile.directional.color}
          transparent
          opacity={0.86}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <mesh
        position={[0, VISION_RIDE_MILE_MARKER.heightMetres / 2, 0]}
        frustumCulled={false}
      >
        <planeGeometry
          args={[
            VISION_RIDE_ROAD_HALF_WIDTH * 2 + 0.25,
            VISION_RIDE_MILE_MARKER.heightMetres - 0.14,
          ]}
        />
        <shaderMaterial
          ref={curtain}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          uniforms={{
            uColor: { value: new THREE.Color(profile.directional.color) },
            uTime: { value: 0 },
            uProgress: { value: 0 },
            uIntegrity: { value: 1 },
          }}
          vertexShader={CHECKPOINT_VERTEX}
          fragmentShader={CHECKPOINT_FRAGMENT}
        />
      </mesh>
      <instancedMesh
        ref={shards}
        args={[undefined, undefined, CHECKPOINT_SHARD_COUNT]}
        visible={false}
        frustumCulled={false}
      >
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[CHECKPOINT_SHARD_VERTICES, 3]}
          />
        </bufferGeometry>
        <meshBasicMaterial
          ref={shardMaterial}
          color={profile.directional.color}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

type LightExtrusionSample = LightRibbonSample &
  Readonly<{
    rightX: number;
    rightY: number;
    upX: number;
    upY: number;
  }>;

type LightRibbonPoint = Readonly<{
  x: number;
  y: number;
  opacity: number;
  scale: number;
  rightX: number;
  rightY: number;
  upX: number;
  upY: number;
}>;

// One continuous spine plus three pairs of forks reproduces the rotated-Y
// signature across each rear lamp. Every segment is swept through the same
// camera history, so the visible result is an extrusion of the emitter rather
// than a Y pattern printed onto a generic ribbon.
const LIGHT_EMITTER_SEGMENTS = [
  [-1, 0, 1, 0],
  [-0.55, 0, -0.82, 1],
  [-0.55, 0, -0.82, -1],
  [0, 0, -0.27, 1],
  [0, 0, -0.27, -1],
  [0.55, 0, 0.28, 1],
  [0.55, 0, 0.28, -1],
] as const;

const LIGHT_EXTRUSION_LAYER_SCALES = [1, 1.68, 2.42] as const;

function writeRearLampInstances(
  mesh: THREE.InstancedMesh,
  thicknessScale: number,
  zOffset: number,
) {
  const trail = VISION_RIDE_LIGHT_TRAIL;
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const zAxis = new THREE.Vector3(0, 0, 1);
  let instance = 0;

  for (const side of [-1, 1] as const) {
    for (const [startX, startY, endX, endY] of LIGHT_EMITTER_SEGMENTS) {
      const mirroredStartX = startX * side;
      const mirroredEndX = endX * side;
      const x1 =
        side * trail.lampLocalX +
        mirroredStartX * trail.emitterHalfWidthMetres;
      const y1 = trail.lampLocalY + startY * trail.emitterHalfHeightMetres;
      const x2 =
        side * trail.lampLocalX +
        mirroredEndX * trail.emitterHalfWidthMetres;
      const y2 = trail.lampLocalY + endY * trail.emitterHalfHeightMetres;
      const deltaX = x2 - x1;
      const deltaY = y2 - y1;
      const length = Math.hypot(deltaX, deltaY);

      position.set(
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        trail.lampLocalZ + zOffset,
      );
      rotation.setFromAxisAngle(zAxis, Math.atan2(deltaY, deltaX));
      scale.set(
        length * (thicknessScale > 1 ? 1.16 : 1),
        0.016 * thicknessScale,
        1,
      );
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(instance, matrix);
      instance += 1;
    }
  }
  mesh.count = instance;
  mesh.instanceMatrix.needsUpdate = true;
}

function LamborghiniRearLights({ color }: { color: string }) {
  const halo = useRef<THREE.InstancedMesh>(null);
  const bloom = useRef<THREE.InstancedMesh>(null);
  const core = useRef<THREE.InstancedMesh>(null);
  const haloColor = useMemo(
    () => new THREE.Color(color).multiplyScalar(1.35),
    [color],
  );
  const bloomColor = useMemo(
    () => new THREE.Color(color).multiplyScalar(1.9),
    [color],
  );
  const coreColor = useMemo(
    () => new THREE.Color(color).multiplyScalar(3.1),
    [color],
  );

  useLayoutEffect(() => {
    if (halo.current) writeRearLampInstances(halo.current, 8.5, -0.016);
    if (bloom.current) writeRearLampInstances(bloom.current, 4.4, -0.019);
    if (core.current) writeRearLampInstances(core.current, 1, -0.022);
  }, []);

  const instanceCount = LIGHT_EMITTER_SEGMENTS.length * 2;
  return (
    <>
      <instancedMesh
        ref={halo}
        args={[undefined, undefined, instanceCount]}
        frustumCulled={false}
        renderOrder={ORDER.dither - 3}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={haloColor}
          transparent
          opacity={0.13}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={bloom}
        args={[undefined, undefined, instanceCount]}
        frustumCulled={false}
        renderOrder={ORDER.dither - 2}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={bloomColor}
          transparent
          opacity={0.34}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={core}
        args={[undefined, undefined, instanceCount]}
        frustumCulled={false}
        renderOrder={ORDER.dither - 1}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={coreColor}
          transparent
          opacity={1}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}

function writeLightExtrusionVertices(input: {
  sideIndex: number;
  points: readonly LightRibbonPoint[];
  positions: THREE.BufferAttribute;
  emitterSpans: THREE.BufferAttribute;
  bloomLayers: THREE.BufferAttribute;
  opacities: THREE.BufferAttribute;
}) {
  const trail = VISION_RIDE_LIGHT_TRAIL;
  const count = input.points.length;
  const fallback = input.points[count - 1] ?? {
    x: 0,
    y: 0,
    opacity: 0,
    scale: 1,
    rightX: 0,
    rightY: 0,
    upX: 0,
    upY: 0,
  };
  const mirroredX = input.sideIndex === 0 ? -1 : 1;
  const verticesPerSegment = trail.samplesPerLamp * 2;
  const extrusionsPerSide =
    LIGHT_EMITTER_SEGMENTS.length * LIGHT_EXTRUSION_LAYER_SCALES.length;
  const sideOffset = input.sideIndex * extrusionsPerSide;
  const expandedSpan = 1 + trail.emitterEndBloomFraction * 2;

  for (
    let layerIndex = 0;
    layerIndex < LIGHT_EXTRUSION_LAYER_SCALES.length;
    layerIndex += 1
  ) {
    const layerScale = LIGHT_EXTRUSION_LAYER_SCALES[layerIndex]!;
    for (
      let segmentIndex = 0;
      segmentIndex < LIGHT_EMITTER_SEGMENTS.length;
      segmentIndex += 1
    ) {
      const [startX, startY, endX, endY] =
        LIGHT_EMITTER_SEGMENTS[segmentIndex]!;
      for (let index = 0; index < trail.samplesPerLamp; index += 1) {
        const point = input.points[index] ?? fallback;
        const rightX = point.rightX * point.scale * mirroredX * layerScale;
        const rightY = point.rightY * point.scale * mirroredX * layerScale;
        const upX = point.upX * point.scale * layerScale;
        const upY = point.upY * point.scale * layerScale;
        const sourceStartX = point.x + rightX * startX + upX * startY;
        const sourceStartY = point.y + rightY * startX + upY * startY;
        const sourceEndX = point.x + rightX * endX + upX * endY;
        const sourceEndY = point.y + rightY * endX + upY * endY;
        const segmentX = sourceEndX - sourceStartX;
        const segmentY = sourceEndY - sourceStartY;
        const bloom = trail.emitterEndBloomFraction;
        const extrusion =
          sideOffset +
          layerIndex * LIGHT_EMITTER_SEGMENTS.length +
          segmentIndex;
        const vertex = extrusion * verticesPerSegment + index * 2;
        const opacity = index < count ? point.opacity : 0;

        input.positions.setXYZ(
          vertex,
          sourceStartX - segmentX * bloom,
          sourceStartY - segmentY * bloom,
          0,
        );
        input.positions.setXYZ(
          vertex + 1,
          sourceEndX + segmentX * bloom,
          sourceEndY + segmentY * bloom,
          0,
        );
        input.emitterSpans.setX(vertex, -expandedSpan);
        input.emitterSpans.setX(vertex + 1, expandedSpan);
        input.bloomLayers.setX(vertex, layerIndex);
        input.bloomLayers.setX(vertex + 1, layerIndex);
        input.opacities.setX(vertex, opacity);
        input.opacities.setX(vertex + 1, opacity);
      }
    }
  }
}

function CarLightRibbons({
  active,
  profile,
  motion,
}: {
  active: boolean;
  profile: VisionRideProfile;
  motion: RefObject<VisionRideMotion>;
}) {
  const carTransform = useMemo(() => new THREE.Object3D(), []);
  const localAnchor = useMemo(() => new THREE.Vector3(), []);
  const worldAnchor = useMemo(() => new THREE.Vector3(), []);
  const basisAnchor = useMemo(() => new THREE.Vector3(), []);
  const projectedLamps = useMemo(
    () => [new THREE.Vector3(), new THREE.Vector3()] as const,
    [],
  );
  const projectedRights = useMemo(
    () => [new THREE.Vector3(), new THREE.Vector3()] as const,
    [],
  );
  const projectedUps = useMemo(
    () => [new THREE.Vector3(), new THREE.Vector3()] as const,
    [],
  );
  const projectedVanishingPoint = useMemo(() => new THREE.Vector3(), []);
  const histories = useRef<[LightExtrusionSample[], LightExtrusionSample[]]>([
    [],
    [],
  ]);
  const previousProjected = useRef<
    [LightExtrusionSample, LightExtrusionSample] | null
  >(null);
  const sampleRemainder = useRef(0);
  const wasActive = useRef(false);

  const geometry = useMemo(() => {
    const trail = VISION_RIDE_LIGHT_TRAIL;
    const extrusionCount =
      LIGHT_EMITTER_SEGMENTS.length *
      LIGHT_EXTRUSION_LAYER_SCALES.length *
      2;
    const vertexCount = trail.samplesPerLamp * 2 * extrusionCount;
    const result = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(
      new Float32Array(vertexCount * 3),
      3,
    );
    const opacities = new THREE.BufferAttribute(
      new Float32Array(vertexCount),
      1,
    );
    const emitterSpans = new THREE.BufferAttribute(
      new Float32Array(vertexCount),
      1,
    );
    const bloomLayers = new THREE.BufferAttribute(
      new Float32Array(vertexCount),
      1,
    );
    const indices = new Uint16Array(
      (trail.samplesPerLamp - 1) * 6 * extrusionCount,
    );

    positions.setUsage(THREE.DynamicDrawUsage);
    opacities.setUsage(THREE.DynamicDrawUsage);
    emitterSpans.setUsage(THREE.DynamicDrawUsage);
    bloomLayers.setUsage(THREE.DynamicDrawUsage);
    for (let extrusion = 0; extrusion < extrusionCount; extrusion += 1) {
      const vertexOffset = extrusion * trail.samplesPerLamp * 2;
      const indexOffset = extrusion * (trail.samplesPerLamp - 1) * 6;
      for (let index = 0; index < trail.samplesPerLamp; index += 1) {
        if (index === trail.samplesPerLamp - 1) continue;
        const vertex = vertexOffset + index * 2;
        const target = indexOffset + index * 6;
        indices.set(
          [vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2],
          target,
        );
      }
    }
    result.setAttribute("position", positions);
    result.setAttribute("aOpacity", opacities);
    result.setAttribute("aEmitterSpan", emitterSpans);
    result.setAttribute("aBloomLayer", bloomLayers);
    result.setIndex(new THREE.BufferAttribute(indices, 1));
    return result;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(profile.point.color) },
        },
        vertexShader: LIGHT_RIBBON_VERTEX,
        fragmentShader: LIGHT_RIBBON_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [profile.point.color],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, delta) => {
    const opacityAttribute = geometry.getAttribute(
      "aOpacity",
    ) as THREE.BufferAttribute;
    if (!active) {
      if (wasActive.current) {
        histories.current = [[], []];
        previousProjected.current = null;
        sampleRemainder.current = 0;
        opacityAttribute.array.fill(0);
        opacityAttribute.needsUpdate = true;
      }
      wasActive.current = false;
      return;
    }
    wasActive.current = true;

    const time = state.clock.elapsedTime;
    const currentTravelDistance = motion.current.travelDistanceMetres;
    const pose = lightTrailCarPose({ time, motion: profile.car });
    carTransform.position.set(
      pose.x +
        motion.current.steering * VISION_RIDE_DRIVING.steeringOffsetMetres,
      pose.y,
      VISION_RIDE_CAMERA.carZ,
    );
    carTransform.rotation.set(
      0,
      Math.PI +
        motion.current.steering * VISION_RIDE_DRIVING.steeringYawRadians,
      pose.roll -
        motion.current.steering * VISION_RIDE_DRIVING.steeringRollRadians,
    );
    carTransform.updateMatrix();
    state.camera.updateMatrixWorld();

    for (const sideIndex of [0, 1] as const) {
      const side = sideIndex === 0 ? -1 : 1;
      localAnchor.set(
        -side * VISION_RIDE_LIGHT_TRAIL.lampLocalX,
        VISION_RIDE_LIGHT_TRAIL.lampLocalY,
        VISION_RIDE_LIGHT_TRAIL.lampLocalZ,
      );
      worldAnchor.copy(localAnchor).applyMatrix4(carTransform.matrix);
      projectedLamps[sideIndex].copy(worldAnchor).project(state.camera);
      basisAnchor
        .set(
          localAnchor.x + VISION_RIDE_LIGHT_TRAIL.emitterHalfWidthMetres,
          localAnchor.y,
          localAnchor.z,
        )
        .applyMatrix4(carTransform.matrix);
      projectedRights[sideIndex].copy(basisAnchor).project(state.camera);
      basisAnchor
        .set(
          localAnchor.x,
          localAnchor.y + VISION_RIDE_LIGHT_TRAIL.emitterHalfHeightMetres,
          localAnchor.z,
        )
        .applyMatrix4(carTransform.matrix);
      projectedUps[sideIndex].copy(basisAnchor).project(state.camera);
    }
    projectedVanishingPoint
      .set(0, VISION_RIDE_CAMERA.lookY, -120)
      .project(state.camera);

    const currentProjected = [0, 1].map((sideIndex) => ({
      x: projectedLamps[sideIndex]!.x,
      y: projectedLamps[sideIndex]!.y,
      rightX: projectedRights[sideIndex]!.x - projectedLamps[sideIndex]!.x,
      rightY: projectedRights[sideIndex]!.y - projectedLamps[sideIndex]!.y,
      upX: projectedUps[sideIndex]!.x - projectedLamps[sideIndex]!.x,
      upY: projectedUps[sideIndex]!.y - projectedLamps[sideIndex]!.y,
      capturedAtSeconds: time,
      travelDistanceMetres: currentTravelDistance,
    })) as [LightExtrusionSample, LightExtrusionSample];

    const previous = previousProjected.current;
    if (!previous) {
      previousProjected.current = currentProjected;
      for (const sideIndex of [0, 1] as const)
        histories.current[sideIndex].push(currentProjected[sideIndex]);
    } else {
      const frameDelta = Math.min(0.1, Math.max(0, delta));
      const interval = VISION_RIDE_LIGHT_TRAIL.sampleIntervalSeconds;
      let sampleOffset = interval - sampleRemainder.current;
      while (sampleOffset <= frameDelta + 0.000_001) {
        const interpolation = frameDelta > 0 ? sampleOffset / frameDelta : 1;
        for (const sideIndex of [0, 1] as const) {
          const history = histories.current[sideIndex];
          history.push({
            x: THREE.MathUtils.lerp(
              previous[sideIndex].x,
              currentProjected[sideIndex].x,
              interpolation,
            ),
            y: THREE.MathUtils.lerp(
              previous[sideIndex].y,
              currentProjected[sideIndex].y,
              interpolation,
            ),
            rightX: THREE.MathUtils.lerp(
              previous[sideIndex].rightX,
              currentProjected[sideIndex].rightX,
              interpolation,
            ),
            rightY: THREE.MathUtils.lerp(
              previous[sideIndex].rightY,
              currentProjected[sideIndex].rightY,
              interpolation,
            ),
            upX: THREE.MathUtils.lerp(
              previous[sideIndex].upX,
              currentProjected[sideIndex].upX,
              interpolation,
            ),
            upY: THREE.MathUtils.lerp(
              previous[sideIndex].upY,
              currentProjected[sideIndex].upY,
              interpolation,
            ),
            capturedAtSeconds: time - frameDelta + sampleOffset,
            travelDistanceMetres: THREE.MathUtils.lerp(
              previous[sideIndex].travelDistanceMetres,
              currentTravelDistance,
              interpolation,
            ),
          });
          if (history.length > VISION_RIDE_LIGHT_TRAIL.samplesPerLamp)
            history.shift();
        }
        sampleOffset += interval;
      }
      sampleRemainder.current =
        (sampleRemainder.current + frameDelta) % interval;
      previousProjected.current = currentProjected;
    }

    const positions = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const emitterSpans = geometry.getAttribute(
      "aEmitterSpan",
    ) as THREE.BufferAttribute;
    const bloomLayers = geometry.getAttribute(
      "aBloomLayer",
    ) as THREE.BufferAttribute;
    for (const sideIndex of [0, 1] as const) {
      histories.current[sideIndex] = histories.current[sideIndex].filter(
        (sample) =>
          lightRibbonShouldRetainSample({
            sample,
            nowSeconds: time,
            speedMultiplier: motion.current.speedMultiplier,
          }),
      );
      const points = histories.current[sideIndex].map((sample) => {
        const presentation = lightRibbonPresentation({
          sample,
          nowSeconds: time,
          travelDistanceMetres: currentTravelDistance,
          speedMultiplier: motion.current.speedMultiplier,
          vanishingPointNdcX: projectedVanishingPoint.x,
          offscreenMarginNdc:
            (Math.abs(sample.rightY) + Math.abs(sample.upY)) *
            VISION_RIDE_LIGHT_TRAIL.maximumEmitterScale *
            LIGHT_EXTRUSION_LAYER_SCALES[
              LIGHT_EXTRUSION_LAYER_SCALES.length - 1
            ]! *
            (1 + VISION_RIDE_LIGHT_TRAIL.emitterEndBloomFraction * 2),
        });
        return {
          ...presentation,
          rightX: sample.rightX,
          rightY: sample.rightY,
          upX: sample.upX,
          upY: sample.upY,
        };
      });
      writeLightExtrusionVertices({
        sideIndex,
        points,
        positions,
        emitterSpans,
        bloomLayers,
        opacities: opacityAttribute,
      });
    }
    positions.needsUpdate = true;
    emitterSpans.needsUpdate = true;
    bloomLayers.needsUpdate = true;
    opacityAttribute.needsUpdate = true;
  }, VISION_RIDE_FRAME_PRIORITY.lightTrails);

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={ORDER.dither - 4}
    />
  );
}

function Lamborghini({
  reducedMotion,
  lightsEnabled,
  profile,
  motion,
}: {
  reducedMotion: boolean;
  lightsEnabled: boolean;
  profile: VisionRideProfile;
  motion: RefObject<VisionRideMotion>;
}) {
  const { scene } = useGLTF(VISION_RIDE_CAR_URL, false);
  const root = useRef<THREE.Group>(null);
  // The wheels travel with the car they were cloned from. They used to live
  // in a ref that the memo filled and the effect cleanup emptied; when the
  // profile changes React runs the old cleanup after the new memo, so the
  // list was wiped and the wheels stopped turning.
  const { car, wheels } = useMemo(() => {
    const clone = scene.clone(true);
    const wheels: THREE.Object3D[] = [];
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.Material | THREE.Material[]
      >;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (mesh.name.includes("Wheel")) {
        const geometry = mesh.geometry.clone();
        geometry.computeBoundingBox();
        const center = geometry.boundingBox?.getCenter(new THREE.Vector3());
        if (center) {
          geometry.translate(-center.x, -center.y, -center.z);
          mesh.position.add(center);
        }
        mesh.geometry = geometry;
        mesh.material = new THREE.MeshStandardMaterial({
          color: profile.car.wheel,
          metalness: 0.42,
          roughness: 0.48,
        });
        wheels.push(mesh);
      } else if (mesh.name.includes("Glass")) {
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: profile.car.glass,
          metalness: 0.18,
          roughness: 0.14,
          transparent: true,
          opacity: 0.84,
        });
      } else {
        const source = Array.isArray(mesh.material)
          ? mesh.material[0]
          : mesh.material;
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: profile.car.body,
          map: source instanceof THREE.MeshStandardMaterial ? source.map : null,
          metalness: 0.5,
          roughness: 0.27,
          clearcoat: 0.58,
          clearcoatRoughness: 0.2,
        });
      }
    });
    return { car: clone, wheels };
  }, [profile.car, scene]);

  useEffect(
    () => () => {
      car.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const mesh = object as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.Material | THREE.Material[]
        >;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) material.dispose();
        if (mesh.name.includes("Wheel")) mesh.geometry.dispose();
      });
    },
    [car],
  );

  useFrame((state, delta) => {
    const group = root.current;
    if (!group) return;
    const time = reducedMotion ? 0 : state.clock.elapsedTime;
    group.position.y = reducedMotion
      ? 0
      : 0.035 +
        Math.sin(time * profile.car.bounceRate) * profile.car.bounceAmount;
    group.position.x = reducedMotion
      ? 0
      : Math.sin(time * profile.car.weaveRate) * profile.car.weaveAmount +
        motion.current.steering * VISION_RIDE_DRIVING.steeringOffsetMetres;
    group.rotation.z = reducedMotion
      ? 0
      : Math.sin(time * profile.car.rollRate) * profile.car.rollAmount -
        motion.current.steering * VISION_RIDE_DRIVING.steeringRollRadians;
    group.rotation.y = reducedMotion
      ? Math.PI
      : Math.PI +
        motion.current.steering * VISION_RIDE_DRIVING.steeringYawRadians;
    // Wheels roll at the road speed: angular rate is speed over radius. The
    // model faces -z after the group's half turn, so its wheel axle is world
    // -x, and rolling forward is a positive turn about the mesh's own x.
    if (!reducedMotion)
      for (const wheel of wheels)
        wheel.rotation.x +=
          (motion.current.speedMetresPerSecond /
            VISION_RIDE_CAMERA.wheelRadiusMetres) *
          Math.min(delta, 1 / 20);
  });

  return (
    <group
      ref={root}
      position={[0, 0, VISION_RIDE_CAMERA.carZ]}
      rotation={[0, Math.PI, 0]}
    >
      <primitive object={car} dispose={null} />
      {lightsEnabled ? <LamborghiniRearLights color={profile.point.color} /> : null}
    </group>
  );
}

export default function VisionRideWorld({
  tier,
  profile,
}: {
  tier: VisionRideTerrainTier;
  profile: VisionRideProfile;
}) {
  const phase = useStacks((state) => state.visionRidePhase);
  const markReady = useStacks((state) => state.markVisionRideReady);
  const retroFxEnabled = useVisionRideRetroFxEnabled();
  const mileMarkersEnabled = useVisionRideMileMarkersEnabled();
  const lightTrailsEnabled = useVisionRideLightTrailsEnabled();
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const readySent = useRef(false);
  const introStartedAt = useRef<number | null>(null);
  const parallax = useRef({ x: 0, y: 0, z: 0 });
  const keysPressed = useRef(new Set<string>());
  const motion = useRef<VisionRideMotion>({
    steering: 0,
    throttle: 0,
    speedMultiplier: 1,
    speedMetresPerSecond: profile.speedMetresPerSecond,
    travelDistanceMetres: 0,
  });
  const pointer = useRef({ x: 0, y: 0 });
  const breath = useRef<EnvironmentBreath>(
    environmentBreath(
      0,
      true,
      chaseFraming(false).chaseDistance,
      profile.breath,
    ),
  );
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const { stars: tierStars } = visionRideTerrainSegments(tier);
  const stars = Math.max(0, Math.round(tierStars * profile.starCountScale));

  // The ride's fullscreen "Remove Vision Pro" button owns pointer events
  // over the canvas, so the fiber pointer never updates here. Mouse and pen
  // listen on the window; touch comes through the control's drag-arbitrated
  // runtime so a quick tap can remain the exit gesture.
  useEffect(() => {
    if (reducedMotion) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      visionRideTouchRuntime.abandon();
      pointer.current = normalizedPointer(
        event.clientX,
        event.clientY,
        window.innerWidth,
        window.innerHeight,
      );
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

  // WASD and the arrows drive the car by key code so keyboard layout does not
  // matter. Held keys are tracked as a set and read per frame; the ride is the
  // only thing on screen, so arrows are claimed unless a field has focus or a
  // modifier is down.
  useEffect(() => {
    if (reducedMotion) return;
    const pressed = keysPressed.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !isVisionRideDriveKey(event.code) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableShortcutTarget(event.target) ||
        // The world mounts during donning, before it owns input; claim keys
        // only while the ride is actually cruising.
        useStacks.getState().visionRidePhase !== "cruising"
      )
        return;
      event.preventDefault();
      pressed.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.code);
    };
    // A tab switch or page transition can drop the keyup, which would leave
    // the camera drifting until the same key is pressed again, so the set is
    // cleared whenever the page loses focus or visibility.
    const clear = () => pressed.clear();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") pressed.clear();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibility);
      pressed.clear();
    };
  }, [reducedMotion]);

  useFrame((_, delta) => {
    if (phase !== "cruising" && phase !== "doffing") return;
    if (reducedMotion) {
      motion.current.steering = 0;
      motion.current.throttle = 0;
      motion.current.speedMultiplier = 1;
      motion.current.speedMetresPerSecond = profile.speedMetresPerSecond;
      return;
    }
    const next = advanceDriveState(
      motion.current,
      driveAxes(keysPressed.current),
      Math.min(delta, 1 / 20),
    );
    const speedMultiplier = driveSpeedMultiplier(next.throttle);
    motion.current.steering = next.steering;
    motion.current.throttle = next.throttle;
    motion.current.speedMultiplier = speedMultiplier;
    motion.current.speedMetresPerSecond =
      profile.speedMetresPerSecond * speedMultiplier;
    motion.current.travelDistanceMetres +=
      motion.current.speedMetresPerSecond * Math.min(delta, 1 / 20);
  }, VISION_RIDE_FRAME_PRIORITY.motion);

  useFrame((state, delta) => {
    if (!readySent.current) {
      readySent.current = true;
      markReady();
    }
    if (phase !== "cruising" && phase !== "doffing") return;
    introStartedAt.current ??= state.clock.elapsedTime;
    const elapsed = reducedMotion
      ? VISION_RIDE_INTRO_SECONDS
      : state.clock.elapsedTime - introStartedAt.current;
    // Opening shot progress: the pull-back from the wheel to the chase.
    // Everything live (shift, breath, bob) scales in with it, so the shot
    // lands exactly on the settled chase pose and the ride takes over.
    const intro = arrivalProgress(elapsed);
    const portrait = size.height > size.width;
    const framing = chaseFraming(portrait);
    const cycle = environmentBreath(
      elapsed,
      reducedMotion,
      framing.chaseDistance,
      profile.breath,
    );
    breath.current = cycle;
    // Damped pointer parallax + ambient drift around the chase
    // target, live from the moment the chase settles (2.8 s), not faded in
    // over the 14 s arrival sweep: gating it on the intro made the mouse
    // feel dead for the first several seconds of the ride. Exponential
    // smoothing against delta, not a per-frame factor, so the feel is
    // identical at 60 and 120 Hz.
    const touch = visionRideTouchRuntime.getSnapshot();
    const steering = touch.engaged ? touch : pointer.current;
    const unscaledTarget = parallaxTarget({
      pointerX: steering.x,
      pointerY: steering.y,
      time: state.clock.elapsedTime,
      portrait,
      reducedMotion,
    });
    const target = {
      x: unscaledTarget.x * profile.parallaxScale,
      y: unscaledTarget.y * profile.parallaxScale,
      z: unscaledTarget.z * profile.parallaxScale,
    };
    const damp = 1 - Math.exp(-VISION_RIDE_PARALLAX.dampingPerSecond * delta);
    parallax.current.x += (target.x - parallax.current.x) * damp;
    parallax.current.y += (target.y - parallax.current.y) * damp;
    parallax.current.z += (target.z - parallax.current.z) * damp;
    const pose = arrivalPose(framing, intro);
    const eyeY =
      pose.position[1] +
      ((reducedMotion ? 0 : Math.sin(elapsed * 0.72) * 0.018) +
        parallax.current.y) *
        intro;
    const cameraZ =
      pose.position[2] +
      // The convex pull shrinks with the breath's closure, so the pointer
      // at its extreme never stacks a full pull on the crest. Throttle adds
      // only a few centimetres at first and tops out at a restrained chase
      // lag: acceleration lets the car pull away, braking closes the gap.
      (cycle.chaseOffset +
        parallax.current.z / cycle.carScale +
        driveChaseOffsetMetres(motion.current.throttle)) *
        intro;
    // The lateral shift is capped by the room the frame has beside the car's
    // rear at this depth. A fixed 2.1 m reach at the 2.25x crest yawed the
    // fender past the side of a portrait or 4:3 frame.
    const reach = lateralReach(
      framing,
      size.width / size.height,
      cameraZ,
      VISION_RIDE_PARALLAX.aimShare,
    );
    const shiftX = THREE.MathUtils.clamp(
      parallax.current.x * intro,
      -reach,
      reach,
    );
    const lateral = pose.position[0] + shiftX;
    camera.position.set(lateral, eyeY, cameraZ);
    // The aim shares only part of the lateral offset, so the live shift is
    // a truck: the vanishing point slides one way and the car drifts the
    // other, instead of the world orbiting a pinned car. Near the crest of
    // the breath the camera tilts down just enough to keep the bumper above
    // the frame edge. Both blend in over the pull-back from the shot's own
    // aim, which starts on the car's flank.
    camera.lookAt(
      pose.aim[0] + chaseAimX(shiftX),
      THREE.MathUtils.lerp(
        pose.aim[1],
        chaseAimY(framing, eyeY, cameraZ),
        intro,
      ),
      pose.aim[2],
    );
    if (camera.fov !== framing.fov) {
      camera.fov = framing.fov;
      camera.updateProjectionMatrix();
    }
  }, VISION_RIDE_FRAME_PRIORITY.camera);

  return (
    <group visible={phase === "cruising" || phase === "doffing"}>
      <RetrowaveSky
        starCount={stars}
        reducedMotion={reducedMotion}
        breath={breath}
        profile={profile}
      />
      <UnifiedLandscape
        reducedMotion={reducedMotion}
        breath={breath}
        profile={profile}
        motion={motion}
      />
      {mileMarkersEnabled && !reducedMotion ? (
        <HolographicCheckpoint
          active={phase === "cruising" || phase === "doffing"}
          reducedMotion={false}
          profile={profile}
          motion={motion}
        />
      ) : null}
      {lightTrailsEnabled && !reducedMotion ? (
        <CarLightRibbons
          active={phase === "cruising" || phase === "doffing"}
          profile={profile}
          motion={motion}
        />
      ) : null}
      <hemisphereLight
        args={[
          profile.hemisphere.sky,
          profile.hemisphere.ground,
          profile.hemisphere.intensity,
        ]}
      />
      <directionalLight
        color={profile.directional.color}
        intensity={profile.directional.intensity}
        position={[-6, 8, 5]}
      />
      <pointLight
        color={profile.point.color}
        intensity={profile.point.intensity}
        distance={28}
        position={[4, 4, -4]}
      />
      <Lamborghini
        reducedMotion={reducedMotion}
        lightsEnabled={lightTrailsEnabled}
        profile={profile}
        motion={motion}
      />
      {retroFxEnabled && (
        <ScreenDitherOverlay reducedMotion={reducedMotion} motion={motion} />
      )}
    </group>
  );
}
