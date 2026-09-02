"use client";

import { useStacks } from "../store";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { type EnvironmentBreath, environmentBreath } from "./visionRideBreath";
import { useVisionRideRetroFxEnabled } from "./visionRideDiagnostics";
import {
  VISION_RIDE_CAMERA,
  VISION_RIDE_GRID_CELL_METRES,
  VISION_RIDE_GRID_HORIZON_METRES,
  VISION_RIDE_INTRO_SECONDS,
  arrivalPose,
  arrivalProgress,
  chaseAimY,
  chaseFraming,
} from "./visionRideCamera";
import { VISION_RIDE_PALETTE, glslVec3 } from "./visionRidePalette";
import {
  VISION_RIDE_PARALLAX,
  chaseAimX,
  isVisionRideShiftKey,
  keyAxes,
  normalizedPointer,
  parallaxTarget,
  rampKeyAxis,
} from "./visionRideParallax";
import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
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
const SKY_COLOR_GLSL = `
  vec3 ditherSky(vec3 color) {
    float pattern = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y) * 2.0, 4.0);
    return floor(color * 40.0 + pattern * 0.25) / 40.0;
  }
  vec3 skyColor(float h, float breath) {
    float lift = breath * 0.03;
    vec3 indigo = ${glslVec3(VISION_RIDE_PALETTE.skyTop)};
    vec3 purple = ${glslVec3(VISION_RIDE_PALETTE.skyUpper)};
    vec3 violet = ${glslVec3(VISION_RIDE_PALETTE.skyViolet)};
    vec3 magenta = ${glslVec3(VISION_RIDE_PALETTE.skyMagenta)};
    vec3 pink = ${glslVec3(VISION_RIDE_PALETTE.skyPink)};
    vec3 coral = mix(${glslVec3(VISION_RIDE_PALETTE.skyHorizon)}, ${glslVec3(VISION_RIDE_PALETTE.skyHorizonCrest)}, breath);
    vec3 below = vec3(0.10, 0.02, 0.19);
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
const SKY_FRAGMENT = `
  varying vec3 vWorld;
  uniform float uBreath;
  ${SKY_COLOR_GLSL}
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
const STAR_FRAGMENT = `
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
    vec3 color = mix(vec3(1.0, 0.95, 0.98), vec3(0.86, 0.90, 1.0), hero * 0.5);
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

const SUN_FRAGMENT = `
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
    vec3 top = ${glslVec3(VISION_RIDE_PALETTE.sunTop)};
    vec3 middle = ${glslVec3(VISION_RIDE_PALETTE.sunMiddle)};
    vec3 bottom = ${glslVec3(VISION_RIDE_PALETTE.sunFoot)};
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
    float bandPhase = fract((vUv.y + 0.018) * 18.0 - uTime * 0.32 * uMotion);
    float grooveWidth = mix(0.055, 0.20, smoothstep(0.30, 0.95, lower));
    float signedBand = bandPhase < 0.5 ? bandPhase : bandPhase - 1.0;
    float bandDistance = abs(signedBand);
    float halfGroove = grooveWidth * 0.5;
    float feather = max(fwidth(vUv.y * 18.0) * 1.5, 0.018);
    float groove = 1.0 - smoothstep(
      halfGroove,
      halfGroove + feather,
      bandDistance
    );
    groove *= stripeRegion;
    vec3 grooveTop = vec3(0.86, 0.34, 0.055);
    vec3 grooveBottom = vec3(0.78, 0.005, 0.72);
    vec3 grooveColor = mix(grooveBottom, grooveTop, smoothstep(0.2, 0.82, vUv.y));
    color = mix(color, grooveColor, groove * 0.64);

    // A soft warm upper lip and violet lower shadow make each moving band read
    // as a shallow recessed groove instead of a hard, flat vector cut.
    float bevelDistance = abs(bandDistance - halfGroove);
    float bevel = (1.0 - smoothstep(0.0, feather * 2.4, bevelDistance)) *
      stripeRegion;
    float upperBevel = bevel * smoothstep(-feather, feather, signedBand);
    float lowerBevel = bevel * (1.0 - smoothstep(-feather, feather, signedBand));
    color += vec3(1.0, 0.48, 0.16) * upperBevel * 0.16;
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

const SUN_GLOW_FRAGMENT = `
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float radius = length(p);
    float corona = pow(max(0.0, 1.0 - radius), 3.2);
    float outer = (1.0 - smoothstep(0.24, 1.0, radius)) * 0.18;
    float alpha = corona * 0.28 + outer * 0.08;
    if (alpha < 0.002) discard;
    vec3 pink = ${glslVec3(VISION_RIDE_PALETTE.sunFoot)};
    vec3 yellow = ${glslVec3(VISION_RIDE_PALETTE.sunTop)};
    vec3 color = mix(pink, yellow, smoothstep(0.25, 0.78, vUv.y));
    gl_FragColor = vec4(color * (0.44 + corona * 0.76), alpha);
  }
`;

const GRID_CELL_METRES = VISION_RIDE_GRID_CELL_METRES;
const GRID_LINE_WIDTH_PX = 1.7;

// Road and mountain fills use this exact screen-space mix. gl_FragCoord is
// measured in drawing-buffer pixels, so the matching viewport-height uniform
// keeps the gradient fixed to the frame across camera movement and DPR.
const SURFACE_GRADIENT_GLSL = `
  uniform float uViewportHeight;
  vec3 ditherSurface(vec3 color) {
    float pattern = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y) * 2.0, 4.0);
    return floor(color * 96.0 + pattern * 0.25) / 96.0;
  }
  vec3 surfaceColor() {
    float viewportY = gl_FragCoord.y / max(uViewportHeight, 1.0);
    float foreground = 1.0 - smoothstep(${VISION_RIDE_PALETTE.surfaceGradientBottom.toFixed(2)}, ${VISION_RIDE_PALETTE.surfaceGradientTop.toFixed(2)}, viewportY);
    return mix(${glslVec3(VISION_RIDE_PALETTE.surfaceBase)}, ${glslVec3(VISION_RIDE_PALETTE.surfaceBottom)}, foreground);
  }
`;

const LANDSCAPE_VERTEX = `
  varying vec2 vUv;
  varying vec2 vFacetUv;
  varying float vMountain;
  varying float vDepth;
  varying float vViewDepth;
  varying float vSkyHeight;
  void main() {
    // These are the mesh's own metre-grid coordinates. The road and mountain
    // vertices therefore cannot restart or drift apart at the shoulder.
    vUv = vec2(position.x, -position.z) / ${GRID_CELL_METRES.toFixed(3)};
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
const LANDSCAPE_FRAGMENT = `
  varying vec2 vUv;
  varying vec2 vFacetUv;
  varying float vMountain;
  varying float vDepth;
  varying float vViewDepth;
  varying float vSkyHeight;
  uniform float uBreath;
  ${SKY_COLOR_GLSL}
  ${SURFACE_GRADIENT_GLSL}
  void main() {
    // fwidth converts the metric grid into screen derivatives, so this is a
    // constant pixel width from the foreground through the horizon.
    vec2 cell = abs(fract(vUv + 0.5) - 0.5) / max(fwidth(vUv) * ${GRID_LINE_WIDTH_PX.toFixed(1)}, vec2(0.001));
    float edge = min(min(cell.x, cell.y), 4.0);
    float distanceFade = 1.0 - smoothstep(0.35, 0.95, vDepth);
    float line = (1.0 - min(edge, 1.0)) * distanceFade;
    // Show the actual coarse triangular faces on the mountain flanks. The
    // metre grid remains continuous underneath, while these diagonal edges
    // expose the large low-poly planes present in the reference.
    vec2 facet = fract(vFacetUv);
    vec2 facetBoundary = min(facet, 1.0 - facet) /
      max(fwidth(vFacetUv) * ${GRID_LINE_WIDTH_PX.toFixed(1)}, vec2(0.001));
    float diagonal = abs(facet.x + facet.y - 1.0) /
      max(fwidth(vFacetUv.x + vFacetUv.y) * ${GRID_LINE_WIDTH_PX.toFixed(1)}, 0.001);
    float facetEdge = min(min(facetBoundary.x, facetBoundary.y), diagonal);
    float facetLine = (1.0 - min(facetEdge, 1.0)) * vMountain * distanceFade;
    line = max(line, facetLine);
    float glow = max(0.0, 1.0 - edge * 0.5) * 0.06;
    vec3 base = surfaceColor();
    vec3 neon = ${glslVec3(VISION_RIDE_PALETTE.roadLine)};
    vec3 color = mix(base, neon, max(line, glow));
    // Custom view-space fog is intentional: the parent scene's short-range
    // room fog is not calibrated for this 190 m chase. Applying it here also
    // guarantees the road and both mountain flanks haze as one surface.
    float fogAmount = smoothstep(
      ${VISION_RIDE_PALETTE.surfaceFogNear.toFixed(1)},
      ${VISION_RIDE_PALETTE.surfaceFogFar.toFixed(1)},
      vViewDepth
    ) * ${VISION_RIDE_PALETTE.surfaceFogMax.toFixed(2)};
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
    vec3 tint = vec3(0.008, 0.0, 0.022) + phosphor * 0.48;
    gl_FragColor = vec4(tint, alpha);
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

const SKY_SPHERE_RADIUS = 420;

function ScreenDitherOverlay({ reducedMotion }: { reducedMotion: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  useFrame((state) => {
    if (material.current)
      material.current.uniforms.uTime!.value = state.clock.elapsedTime;
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
}: {
  starCount: number;
  reducedMotion: boolean;
  breath: RefObject<EnvironmentBreath>;
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
    if (sun.current) sun.current.scale.setScalar(cycle.sunScale);
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
          ref={skyMaterial}
          side={THREE.BackSide}
          depthWrite={false}
          toneMapped={false}
          uniforms={{ uBreath: { value: 0 } }}
          vertexShader={SKY_VERTEX}
          fragmentShader={SKY_FRAGMENT}
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
          fragmentShader={STAR_FRAGMENT}
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
            transparent
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            vertexShader={SUN_VERTEX}
            fragmentShader={SUN_GLOW_FRAGMENT}
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
            fragmentShader={SUN_FRAGMENT}
          />
        </mesh>
      </group>
    </>
  );
}

function UnifiedLandscape({
  reducedMotion,
  breath,
}: {
  reducedMotion: boolean;
  breath: RefObject<EnvironmentBreath>;
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
        vertexShader: LANDSCAPE_VERTEX,
        fragmentShader: LANDSCAPE_FRAGMENT,
      }),
    [viewportHeight],
  );

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    material.uniforms.uBreath!.value = breath.current.phase;
    const travel = reducedMotion ? 0 : state.clock.elapsedTime * 12;
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
        frustumCulled={false}
        renderOrder={ORDER.mountains}
      />
      <mesh
        ref={middle}
        geometry={geometry}
        material={material}
        position={[0, -0.02, -VISION_RIDE_PERIOD_METRES]}
        frustumCulled={false}
        renderOrder={ORDER.mountains}
      />
      <mesh
        ref={horizon}
        geometry={geometry}
        material={material}
        position={[0, -0.02, -VISION_RIDE_PERIOD_METRES * 2]}
        frustumCulled={false}
        renderOrder={ORDER.mountains}
      />
    </>
  );
}

function Lamborghini({ reducedMotion }: { reducedMotion: boolean }) {
  const { scene } = useGLTF(VISION_RIDE_CAR_URL, false);
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Object3D[]>([]);
  const car = useMemo(() => {
    const clone = scene.clone(true);
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
          color: "#10071c",
          metalness: 0.42,
          roughness: 0.48,
        });
        wheels.current.push(mesh);
      } else if (mesh.name.includes("Glass")) {
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: "#071330",
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
          color: "#ffffff",
          map: source instanceof THREE.MeshStandardMaterial ? source.map : null,
          metalness: 0.5,
          roughness: 0.27,
          clearcoat: 0.58,
          clearcoatRoughness: 0.2,
        });
      }
    });
    return clone;
  }, [scene]);

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
      wheels.current = [];
    },
    [car],
  );

  useFrame((state) => {
    const group = root.current;
    if (!group) return;
    const time = reducedMotion ? 0 : state.clock.elapsedTime;
    group.position.y = reducedMotion ? 0 : 0.035 + Math.sin(time * 3.1) * 0.025;
    group.position.x = reducedMotion ? 0 : Math.sin(time * 0.42) * 0.22;
    group.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.83) * 0.008;
    if (!reducedMotion)
      for (const wheel of wheels.current) wheel.rotation.x -= 0.12;
  });

  return (
    <group
      ref={root}
      position={[0, 0, VISION_RIDE_CAMERA.carZ]}
      rotation={[0, Math.PI, 0]}
    >
      <primitive object={car} dispose={null} />
    </group>
  );
}

export default function VisionRideWorld({
  tier,
}: {
  tier: VisionRideTerrainTier;
}) {
  const phase = useStacks((state) => state.visionRidePhase);
  const markReady = useStacks((state) => state.markVisionRideReady);
  const retroFxEnabled = useVisionRideRetroFxEnabled();
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const readySent = useRef(false);
  const introStartedAt = useRef<number | null>(null);
  const parallax = useRef({ x: 0, y: 0, z: 0 });
  const keysPressed = useRef(new Set<string>());
  const keyAxis = useRef({ x: 0, y: 0 });
  const pointer = useRef({ x: 0, y: 0 });
  const breath = useRef<EnvironmentBreath>(
    environmentBreath(0, true, chaseFraming(false).chaseDistance),
  );
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const { stars } = visionRideTerrainSegments(tier);

  // The ride's fullscreen "Remove Vision Pro" button owns pointer events
  // over the canvas, so the fiber pointer never updates here. Listen on the
  // window instead; touch is excluded because a tap is the exit gesture and
  // would jerk the orbit on its way out.
  useEffect(() => {
    if (reducedMotion) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
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

  // WASD and the arrows drive the same shift as the pointer, by key code so
  // the layout does not matter. Held keys are tracked as a set and read per
  // frame; the ride is the only thing on screen, so the arrows are claimed
  // (no page scroll) unless a text field has focus or a modifier is down.
  useEffect(() => {
    if (reducedMotion) return;
    const pressed = keysPressed.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !isVisionRideShiftKey(event.code) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableShortcutTarget(event.target)
      )
        return;
      event.preventDefault();
      pressed.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.code);
    };
    const clear = () => pressed.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      pressed.clear();
    };
  }, [reducedMotion]);

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
    );
    breath.current = cycle;
    // Damped pointer parallax + keys + ambient drift around the chase
    // target, live from the moment the chase settles (2.8 s), not faded in
    // over the 14 s arrival sweep: gating it on the intro made the mouse
    // feel dead for the first several seconds of the ride. Exponential
    // smoothing against delta, not a per-frame factor, so the feel is
    // identical at 60 and 120 Hz. Keys ramp linearly so a tap nudges and a
    // hold sweeps to the extreme.
    const wanted = keyAxes(keysPressed.current);
    keyAxis.current.x = rampKeyAxis(keyAxis.current.x, wanted.x, delta);
    keyAxis.current.y = rampKeyAxis(keyAxis.current.y, wanted.y, delta);
    const target = parallaxTarget({
      pointerX: pointer.current.x + keyAxis.current.x,
      pointerY: pointer.current.y + keyAxis.current.y,
      time: state.clock.elapsedTime,
      portrait,
      reducedMotion,
    });
    const damp = 1 - Math.exp(-VISION_RIDE_PARALLAX.dampingPerSecond * delta);
    parallax.current.x += (target.x - parallax.current.x) * damp;
    parallax.current.y += (target.y - parallax.current.y) * damp;
    parallax.current.z += (target.z - parallax.current.z) * damp;
    const pose = arrivalPose(framing, intro);
    const lateral = pose.position[0] + parallax.current.x * intro;
    const eyeY =
      pose.position[1] +
      ((reducedMotion ? 0 : Math.sin(elapsed * 0.72) * 0.018) +
        parallax.current.y) *
        intro;
    const cameraZ =
      pose.position[2] +
      // The convex pull shrinks with the breath's closure, so the pointer
      // or keys at their extreme never stack a full pull on the crest.
      (cycle.chaseOffset + parallax.current.z / cycle.carScale) * intro;
    camera.position.set(lateral, eyeY, cameraZ);
    // The aim shares only part of the lateral offset, so the live shift is
    // a truck: the vanishing point slides one way and the car drifts the
    // other, instead of the world orbiting a pinned car. Near the crest of
    // the breath the camera tilts down just enough to keep the bumper above
    // the frame edge. Both blend in over the pull-back from the shot's own
    // aim, which starts on the car's flank.
    camera.lookAt(
      pose.aim[0] + chaseAimX(parallax.current.x) * intro,
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
  });

  return (
    <group visible={phase === "cruising" || phase === "doffing"}>
      <RetrowaveSky
        starCount={stars}
        reducedMotion={reducedMotion}
        breath={breath}
      />
      <UnifiedLandscape reducedMotion={reducedMotion} breath={breath} />
      <hemisphereLight args={["#b9c7ff", "#3a004d", 1.5]} />
      <directionalLight color="#ff9a63" intensity={3.2} position={[-6, 8, 5]} />
      <pointLight
        color="#ff2b9f"
        intensity={18}
        distance={28}
        position={[4, 4, -4]}
      />
      <Lamborghini reducedMotion={reducedMotion} />
      {retroFxEnabled && <ScreenDitherOverlay reducedMotion={reducedMotion} />}
    </group>
  );
}
