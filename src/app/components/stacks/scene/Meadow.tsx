"use client";

// The meadow below the horizon — dense opaque grass, rolling fogged hills,
// flower drifts — the AGI-footer read rebuilt on the original skeleton: one
// InstancedMesh per vegetation kind, matrices written once, every animation
// in the vertex shader, zero textures, three draw calls (~150k tris total).
//
// Opaque blades on purpose. The previous alpha-card tufts needed DoubleSide +
// discard + mip-dissolving DataTextures; cards read flat and game-y, and on
// mobile TBDR GPUs `discard` disables hidden-surface removal for everything
// behind them. Tapered 4-tri blades with front+back faces baked at flipped
// winding keep FrontSide culling, full early-z, and no alpha at any distance.
//
// All placement math lives in meadowField.ts (pure, shared with vitest and
// scripts/stacks-meadow-check.ts); this file owns geometry, GLSL, and the
// per-frame uniform writes — nothing else runs per frame.
import { progressRef } from "../store";
import { PALETTES } from "../theme";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  MEADOW_FLOWER_TOTAL,
  MEADOW_FOG,
  MEADOW_GRASS_TOTAL,
  MEADOW_RUNG_FLOWERS,
  MEADOW_RUNG_GRASS,
  MEADOW_TERRAIN,
  buildFlowerPositions,
  buildGrassInstances,
  meadowHeight,
} from "./meadowField";

// Meadow-only colors — not PALETTES duplicates, so local hexes are
// legitimate. Authored deep: ACES compresses the upper mids ~3:1, and the
// screen target is the reference's pastel sage/cream, not lawn green. Dark
// is a moonlit blue-green with pale silver/lavender flower heads.
const COLORS = {
  baseL: "#4d6338",
  tipL: "#b8c48b",
  baseD: "#131f1a",
  tipD: "#43584a",
  flowerA: "#d4789f", // pink, 55%
  flowerB: "#d9a94e", // yellow, 20%
  flowerC: "#e6dcc2", // cream, 25%
  nightA: "#9aa0c4",
  nightB: "#c0c6d8",
} as const;

// Blade profile (geometry is height-normalized so position.y IS the 0→1
// wind gate): base half-width 0.009 tapering to 0.0016 at the tip.
const BLADE_BASE_HW = 0.009;
const BLADE_TIP_HW = 0.0016;
// Flower quad, world units before instance scale.
const FLOWER_HW = 0.022;
const FLOWER_H = 0.044;

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
// for a calm bias — mostly quiet, occasional swells. Returns the lean in
// radians (XZ plane). uTime-based real seconds, never per-frame deltas —
// immune to the 120 Hz double-speed trap.
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
// palette crossfade × the dawn tint (SceneEnvironment dawnTint/dawnLift) ×
// the below-horizon darkening at that elevation. This is the dark-theme
// edge fix: below the horizon the dome shows skyShadow-derived color
// (#1b2233 family), NOT palette.fog #253045 — converging on scene fog left
// a visible seam at every fogged edge. The dome's ±3% air noise and the
// light-mode zenith cap never reach e < 0.02, so this reproduces the dome's
// below-horizon pixel to well under a tonemapped value step.
//
// uSeat is deliberately absent: seated, the DC window redraws the dome, but
// the only meadow surface in that frame is the bank at ≤ ~10% fog weight —
// everything heavily fogged is out of frame or occluded by the crest.
const DOME_GLSL = /* glsl */ `
  vec3 domeBelow(vec3 worldPos) {
    vec3 shadowC = mix(uShadowL, uShadowD, uDark);
    shadowC *= (vec3(1.0) + vec3(0.050, 0.025, -0.018) * uDawn)
             * (1.0 + uDawn * mix(0.10, 0.17, uDark));
    float e = normalize(worldPos - cameraPosition).y;
    return shadowC * mix(1.0, mix(0.88, 0.45, uDark), smoothstep(0.02, 0.30, -e));
  }
`;

// Fog ramps interpolated from meadowField so the shader and the headless
// check script cannot drift: grass saturates at 22, terrain at exactly the
// scene-fog far (24) — the instanced→terrain handoff maintains itself.
const GRASS_FOG = `smoothstep(${MEADOW_FOG.grass[0].toFixed(1)}, ${MEADOW_FOG.grass[1].toFixed(1)}, -mv.z)`;
const TERRAIN_FOG = `smoothstep(${MEADOW_FOG.terrain[0].toFixed(1)}, ${MEADOW_FOG.terrain[1].toFixed(1)}, -mv.z)`;

const GRASS_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uDark;
  uniform float uDawn;
  uniform float uWindAmp;
  uniform float uWindSpeed;
  uniform float uThicken;
  uniform vec3 uShadowL;
  uniform vec3 uShadowD;
  varying float vT;
  varying float vVar;
  varying float vWind;
  varying float vFog;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  ${WIND_GLSL}
  ${DOME_GLSL}
  void main() {
    vec3 origin = vec3(instanceMatrix[3]);
    float t = position.y;
    // Wind lean gated linearly by height, plus a per-blade resting droop
    // with a quadratic ease so blades rest bent at the tip, not hinged at
    // the root. Displacement form (p.xz += bend·y; p.y −= ½|bend|²·y) is the
    // rigid rotation exact to 2nd order — max total bend ≈ 0.38 rad keeps
    // the length error under 1% with no per-vertex axis-angle matrices.
    vec2 w = windAt(origin.xz, uTime * uWindSpeed);
    float dr = hash2(origin.xz * 1.93);
    vec2 droopDir = normalize(vec2(dr - 0.5, hash2(origin.xz * 3.11) - 0.5) + 1e-4);
    vec2 bend = w * t + droopDir * (0.10 + 0.14 * dr) * t * t;
    vec3 p = position;
    p.xz += bend * position.y;
    p.y -= 0.5 * dot(bend, bend) * position.y;
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * world;
    // View-space thickening (SimonDev Quick_Grass): an edge-on opaque blade
    // is a sub-pixel line that MSAA dissolves into shimmer; when the camera
    // looks along the blade plane, push the silhouette columns apart in view
    // space. The smoothstep guard backs the push off again at full edge-on
    // so the blade cannot tear into two strips.
    vec3 nV = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    float vdn = clamp(abs(nV.z), 0.0, 1.0);
    float thicken = (1.0 - vdn) * (1.0 - vdn) * smoothstep(0.0, 0.2, vdn);
    mv.x += uThicken * thicken * (uv.x - 0.5) * 0.014 * sign(nV.z);
    vT = t;
    vVar = hash2(origin.xz * 1.31);
    vWind = length(w);
    vFog = ${GRASS_FOG};
    vFogColor = domeBelow(world.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const GRASS_FRAGMENT = /* glsl */ `
  uniform float uDark;
  uniform float uDawn;
  uniform vec3 uBaseL;
  uniform vec3 uBaseD;
  uniform vec3 uTipL;
  uniform vec3 uTipD;
  varying float vT;
  varying float vVar;
  varying float vWind;
  varying float vFog;
  varying vec3 vFogColor;
  void main() {
    vec3 base = mix(uBaseL, uBaseD, uDark);
    vec3 tip = mix(uTipL, uTipD, uDark);
    tip = mix(tip, tip * 0.78, vVar * 0.6);
    vec3 col = mix(base, tip, smoothstep(0.05, 0.95, vT));
    // The dawn warms the tips as the traverse advances; gusts catch a
    // subtle sheen on whatever they are currently leaning.
    col *= 1.0 + vec3(0.055, 0.028, -0.020) * uDawn * vT;
    col *= 1.0 + vWind * 1.6 * vT * mix(0.35, 0.15, uDark);
    col = mix(col, vFogColor, vFog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const TERRAIN_VERTEX = /* glsl */ `
  uniform float uDark;
  uniform float uDawn;
  uniform vec3 uShadowL;
  uniform vec3 uShadowD;
  varying vec3 vWorld;
  varying float vSlope;
  varying float vFog;
  varying vec3 vFogColor;
  ${DOME_GLSL}
  void main() {
    vWorld = position;
    vSlope = clamp(normal.y, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFog = ${TERRAIN_FOG};
    vFogColor = domeBelow(position);
    gl_Position = projectionMatrix * mv;
  }
`;

const TERRAIN_FRAGMENT = /* glsl */ `
  uniform float uDark;
  uniform float uDawn;
  uniform vec3 uBaseL;
  uniform vec3 uBaseD;
  uniform vec3 uTipL;
  uniform vec3 uTipD;
  varying vec3 vWorld;
  varying float vSlope;
  varying float vFog;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  void main() {
    float varied = vnoise(vWorld.xz * 0.35);
    vec3 base = mix(uBaseL, uBaseD, uDark);
    // A hair under the blade tips so blades read against the soil.
    vec3 tip = mix(uTipL, uTipD, uDark) * 0.90;
    vec3 col = mix(base, tip, 0.25 + 0.5 * varied);
    col *= mix(0.80, 1.06, vSlope);
    col *= 1.0 + vec3(0.055, 0.028, -0.020) * uDawn * 0.5;
    col = mix(col, vFogColor, vFog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FLOWER_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uDark;
  uniform float uDawn;
  uniform float uWindAmp;
  uniform float uWindSpeed;
  uniform float uPixelScale;
  uniform float uPxFloor;
  uniform vec3 uShadowL;
  uniform vec3 uShadowD;
  varying float vTint;
  varying float vClamp;
  varying float vFog;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  ${WIND_GLSL}
  ${DOME_GLSL}
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
    // normalizes to the same radians·height product the blades use.
    vec2 w = windAt(origin.xz, uTime * uWindSpeed) * 0.35;
    p.xz += w * position.y * ${(1 / FLOWER_H).toFixed(2)};
    // Pixel floor: a far head that would project under uPxFloor pixels is
    // scaled up about its own centre to hold that size, and the fragment
    // dissolves it toward the fog color by the clamped amount instead —
    // opaque material, so a color dissolve is the only shimmer kill there is.
    vec3 c = vec3(0.0, ${(FLOWER_H / 2).toFixed(3)} * s, 0.0);
    float depth = -(viewMatrix * vec4(origin + c, 1.0)).z;
    float px = uPixelScale * ${FLOWER_H.toFixed(3)} * s / max(depth, 1e-3);
    float k = max(1.0, uPxFloor / max(px, 1e-4));
    p = (p - c) * k + c;
    vec4 world = modelMatrix * vec4(origin + p, 1.0);
    vec4 mv = viewMatrix * world;
    vTint = hash2(origin.xz * 2.71);
    vClamp = 1.0 - 1.0 / k;
    vFog = ${GRASS_FOG};
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
  varying float vClamp;
  varying float vFog;
  varying vec3 vFogColor;
  ${NOISE_GLSL}
  void main() {
    vec3 day = vTint < 0.55 ? uFlowerA : (vTint < 0.75 ? uFlowerB : uFlowerC);
    day *= 0.92 + 0.16 * hash2(vec2(vTint, 7.7));
    // Moonlit silver/lavender — a color crossfade on the shared uDark clock,
    // in step with the sky's own theme damp.
    vec3 night = mix(uNightA, uNightB, step(0.5, vTint));
    vec3 col = mix(day, night, uDark * 0.85);
    col = mix(col, vFogColor, max(vFog, vClamp * 0.85));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Geometry builders.

/** Opaque tapered blade: 8 verts / 4 tris, height-normalized to 1. Both
 * faces are baked with flipped winding and authored ±Z normals, so the
 * default FrontSide draws the blade from every direction — no DoubleSide,
 * no discard, and mobile TBDR hidden-surface removal stays on. */
function makeBladeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const quad = [
    -BLADE_BASE_HW, 0, 0,
    BLADE_BASE_HW, 0, 0,
    BLADE_TIP_HW, 1, 0,
    -BLADE_TIP_HW, 1, 0,
  ];
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([...quad, ...quad], 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  return geometry;
}

/** Flower head: one quad, Y-billboarded in the vertex shader (the camera
 * only ever sees its front face). */
function makeFlowerGeometry(): THREE.BufferGeometry {
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
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, meadowHeight(positions.getX(i), positions.getZ(i)));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------

export default function Meadow({
  dark,
  rung = 3,
}: {
  dark: boolean;
  /** Quality rung (3 = full). Maps 1:1 onto MEADOW_RUNG_* counts; the
   * buffer's rung-stratified order makes each step a uniform density cut
   * across every band rather than a depth cut. */
  rung?: 0 | 1 | 2 | 3;
}) {
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const flowerRef = useRef<THREE.InstancedMesh>(null);

  const built = useMemo(() => {
    const c = (hex: string) => new THREE.Color(hex);
    // ONE set of uniform holders — the three materials reference the SAME
    // { value } objects, so each per-frame write updates all of them.
    const shared = {
      uTime: { value: 0 },
      uDark: { value: dark ? 1 : 0 },
      uDawn: { value: 0 },
      uWindAmp: { value: 0.14 },
      uWindSpeed: { value: 0.85 },
      uThicken: { value: 1.0 },
      // skyShadow comes from PALETTES — never a duplicated palette hex.
      uShadowL: { value: c(PALETTES.light.skyShadow) },
      uShadowD: { value: c(PALETTES.dark.skyShadow) },
      uBaseL: { value: c(COLORS.baseL) },
      uBaseD: { value: c(COLORS.baseD) },
      uTipL: { value: c(COLORS.tipL) },
      uTipD: { value: c(COLORS.tipD) },
    };
    const flowerOnly = {
      uFlowerA: { value: c(COLORS.flowerA) },
      uFlowerB: { value: c(COLORS.flowerB) },
      uFlowerC: { value: c(COLORS.flowerC) },
      uNightA: { value: c(COLORS.nightA) },
      uNightB: { value: c(COLORS.nightB) },
      uPixelScale: { value: 1000 },
      uPxFloor: { value: 1.5 },
    };
    return {
      shared,
      flowerOnly,
      terrainGeometry: makeTerrainGeometry(),
      bladeGeometry: makeBladeGeometry(),
      flowerGeometry: makeFlowerGeometry(),
      terrainMaterial: new THREE.ShaderMaterial({
        uniforms: { ...shared },
        vertexShader: TERRAIN_VERTEX,
        fragmentShader: TERRAIN_FRAGMENT,
      }),
      grassMaterial: new THREE.ShaderMaterial({
        uniforms: { ...shared },
        vertexShader: GRASS_VERTEX,
        fragmentShader: GRASS_FRAGMENT,
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

  // Instance fill, once. Matrices come out of meadowField's rung-ordered
  // streams; nothing here is ever rewritten.
  useEffect(() => {
    const grassMesh = grassRef.current;
    const flowerMesh = flowerRef.current;
    if (!grassMesh || !flowerMesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const grass = buildGrassInstances();
    for (let i = 0; i < grass.count; i++) {
      position.set(grass.x[i]!, grass.y[i]!, grass.z[i]);
      euler.set(0, grass.yaw[i]!, 0);
      quaternion.setFromEuler(euler);
      scale.set(grass.width[i]!, grass.height[i]!, grass.width[i]);
      matrix.compose(position, quaternion, scale);
      grassMesh.setMatrixAt(i, matrix);
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    grassMesh.computeBoundingSphere();
    const flowers = buildFlowerPositions();
    quaternion.identity();
    for (let i = 0; i < flowers.count; i++) {
      position.set(flowers.x[i]!, flowers.y[i]!, flowers.z[i]);
      scale.setScalar(flowers.scale[i]!);
      matrix.compose(position, quaternion, scale);
      flowerMesh.setMatrixAt(i, matrix);
    }
    flowerMesh.instanceMatrix.needsUpdate = true;
    flowerMesh.computeBoundingSphere();
  }, []);

  useEffect(
    () => () => {
      built.terrainGeometry.dispose();
      built.bladeGeometry.dispose();
      built.flowerGeometry.dispose();
      built.terrainMaterial.dispose();
      built.grassMaterial.dispose();
      built.flowerMaterial.dispose();
    },
    [built],
  );

  // The complete per-frame cost: five uniform writes and two count fields.
  useFrame(({ clock, gl, camera }, delta) => {
    const shared = built.shared;
    shared.uDark.value = THREE.MathUtils.damp(
      shared.uDark.value,
      dark ? 1 : 0,
      3.5,
      delta,
    );
    shared.uDawn.value = progressRef.current;
    shared.uTime.value = clock.elapsedTime;
    // Pixels per world unit at depth 1 — one multiply per frame buys
    // resize/dpr safety with no listener. domElement.height is the drawing
    // buffer (device pixels), which is what the flower px floor measures in.
    built.flowerOnly.uPixelScale.value =
      (gl.domElement.height * camera.projectionMatrix.elements[5]) / 2;
    if (grassRef.current) grassRef.current.count = MEADOW_RUNG_GRASS[rung];
    if (flowerRef.current) flowerRef.current.count = MEADOW_RUNG_FLOWERS[rung];
  });

  // Draw order terrain → grass → flowers; all opaque, so three's own
  // front-to-back object sort keeps early-z doing the overdraw work.
  return (
    <group>
      <mesh geometry={built.terrainGeometry} material={built.terrainMaterial} />
      <instancedMesh
        ref={grassRef}
        args={[built.bladeGeometry, built.grassMaterial, MEADOW_GRASS_TOTAL]}
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
