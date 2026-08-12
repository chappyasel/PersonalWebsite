"use client";

// A small, scene-specific adaptation of the alpha-card grass technique
// described by Ebenezer in FluffyGrass:
// https://github.com/thebenezer/FluffyGrass
// https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/
//
// The reference implementation targets a walkable million-blade landscape.
// The homepage only needs a quiet meadow behind the furniture, so one bounded
// instanced field (three crossed cards per tuft), one terrain draw and one
// flower-points draw are enough. The alpha map is generated in memory: no
// copied model or texture enters the application bundle.
import { PALETTES, rand } from "../theme";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { poolTexture } from "./GroundPool";
import { TRAVEL_X } from "./worldLayout";

// The plane is not a shelf-sized patch. Its known camera path is finite, so
// we can make one effectively-infinite landscape with enough lateral overscan
// for the widest desktop frustum at the far clipping/fog distance. Neither
// side edge can enter the view anywhere along the 0→TRAVEL_X traverse.
const FIELD_LEFT = -44;
const FIELD_WIDTH = TRAVEL_X + 88;
// The reference works because landscape owns the whole lower frame, not just
// the horizon. The terrain therefore runs almost to the camera; blades stop
// a little earlier so no single alpha card becomes a screen-sized foreground
// obstruction.
const FIELD_NEAR_Z = 8;
const VEGETATION_NEAR_Z = 3.25;
// Geometry continues long after it has become 100% horizon fog. The back edge
// therefore has no visual value to cut against the sky.
const FIELD_FAR_Z = -82;
const FIELD_DEPTH = FIELD_NEAR_Z - FIELD_FAR_Z;
const VEGETATION_LEFT = -30;
const VEGETATION_WIDTH = TRAVEL_X + 59;
const VEGETATION_FAR_Z = -42;
const VEGETATION_DEPTH = VEGETATION_NEAR_Z - VEGETATION_FAR_Z;
const GRASS_COUNT = 8000;
const FLOWER_COUNT = 1500;

function meadowHeight(x: number, z: number): number {
  const depth = THREE.MathUtils.clamp((FIELD_NEAR_Z - z) / FIELD_DEPTH, 0, 1);
  // A continuous distant rise makes the sky contact an authored rolling
  // silhouette instead of exposing the end of a horizontal rectangle.
  const farRise = THREE.MathUtils.smoothstep(depth, 0.2, 0.72);
  const broadRoll =
    Math.sin(x * 0.22 + 0.7) * 0.14 + Math.sin(x * 0.47 - 1.4) * 0.055;
  const nearUndulation =
    Math.sin(x * 0.58 + z * 0.31) * 0.025 +
    Math.sin(x * 0.19 - z * 0.44) * 0.018;
  return -1.17 + nearUndulation + farRise * (0.9 + broadRoll * 1.7);
}

function makeTerrainGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_DEPTH, 192, 88);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(
    FIELD_LEFT + FIELD_WIDTH / 2,
    0,
    FIELD_FAR_Z + FIELD_DEPTH / 2,
  );
  const positions = geometry.attributes.position!;
  const variation = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, meadowHeight(x, z));
    variation[i] =
      0.5 +
      Math.sin(x * 0.63 + z * 0.42) * 0.22 +
      Math.sin(x * 1.7 - z * 0.81) * 0.08;
  }
  geometry.setAttribute("aVariation", new THREE.BufferAttribute(variation, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const width = 0.16;
  // At 0.25 the cards read as knee-high reeds next to the shelf feet. This
  // meadow is a soft ground texture, so the visible blade is one-third that
  // height; width stays broad enough for the crossed-card tuft to remain full.
  const height = 0.083;
  for (let card = 0; card < 3; card++) {
    const angle = (card * Math.PI) / 3;
    const dx = Math.cos(angle) * width * 0.5;
    const dz = Math.sin(angle) * width * 0.5;
    const base = positions.length / 3;
    positions.push(-dx, 0, -dz, dx, 0, dz, dx, height, dz, -dx, height, -dz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Seven overlapping curved blades encoded into a tiny deterministic alpha. */
function makeTuftTexture(): THREE.DataTexture {
  const width = 48;
  const height = 96;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      let alpha = 0;
      for (let blade = 0; blade < 9; blade++) {
        const root = 0.08 + blade * 0.105;
        const lean = (blade - 4) * 0.022;
        const centre = root + lean * v + Math.sin(v * 2.8 + blade) * 0.018;
        const taper = (1 - v) * 0.035 + 0.007;
        const bladeTop = 0.62 + rand(blade, 91) * 0.38;
        if (v <= bladeTop && Math.abs(u - centre) < taper) alpha = 255;
      }
      const i = (y * width + x) * 4;
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(
    pixels,
    width,
    height,
    THREE.RGBAFormat,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const TERRAIN_VERTEX = `
  attribute float aVariation;
  varying float vVariation;
  varying float vViewDepth;
  varying float vSlope;
  void main() {
    vVariation = aVariation;
    vSlope = clamp(normal.y, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const TERRAIN_FRAGMENT = `
  uniform float uDark;
  uniform vec3 uFogLight;
  uniform vec3 uFogDark;
  varying float vVariation;
  varying float vViewDepth;
  varying float vSlope;
  void main() {
    vec3 rootL = vec3(0.085, 0.225, 0.075);
    vec3 tipL = vec3(0.35, 0.53, 0.14);
    vec3 rootD = vec3(0.025, 0.080, 0.055);
    vec3 tipD = vec3(0.105, 0.19, 0.085);
    vec3 root = mix(rootL, rootD, uDark);
    vec3 tip = mix(tipL, tipD, uDark);
    float varied = clamp(vVariation, 0.0, 1.0);
    vec3 color = mix(root, tip, 0.30 + varied * 0.46);
    color *= mix(0.78, 1.08, vSlope);
    vec3 fogColor = mix(uFogLight, uFogDark, uDark);
    // Reach the exact shared fog/horizon colour well before geometry ends.
    // Partial fog preserved a green back edge no matter how far we moved it.
    float fog = smoothstep(15.0, 40.0, vViewDepth);
    color = mix(color, fogColor, fog);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const GRASS_VERTEX = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vVariation;
  varying float vViewDepth;
  void main() {
    vUv = uv;
    vec3 transformed = position;
    vec3 instanceOrigin = vec3(instanceMatrix[3]);
    float tip = smoothstep(0.0, 0.08, position.y);
    float phase = instanceOrigin.x * 0.41 + instanceOrigin.z * 0.27;
    transformed.x += sin(uTime * 0.72 + phase) * 0.008 * tip;
    transformed.z += cos(uTime * 0.58 + phase * 1.31) * 0.006 * tip;
    vVariation = 0.5 + 0.5 * sin(phase * 3.7);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const GRASS_FRAGMENT = `
  uniform float uDark;
  uniform sampler2D uAlpha;
  uniform vec3 uFogLight;
  uniform vec3 uFogDark;
  varying vec2 vUv;
  varying float vVariation;
  varying float vViewDepth;
  void main() {
    float alpha = texture2D(uAlpha, vUv).a;
    if (alpha < 0.34) discard;
    vec3 rootL = vec3(0.055, 0.17, 0.045);
    vec3 tipA = vec3(0.42, 0.64, 0.17);
    vec3 tipB = vec3(0.19, 0.40, 0.095);
    vec3 rootD = vec3(0.018, 0.055, 0.038);
    vec3 tipDA = vec3(0.12, 0.25, 0.095);
    vec3 tipDB = vec3(0.055, 0.14, 0.075);
    vec3 root = mix(rootL, rootD, uDark);
    vec3 tip = mix(mix(tipA, tipB, vVariation),
                   mix(tipDA, tipDB, vVariation), uDark);
    vec3 color = mix(root, tip, smoothstep(0.0, 0.88, vUv.y));
    vec3 fogColor = mix(uFogLight, uFogDark, uDark);
    // Cards vanish into the fully fogged terrain before their distribution
    // ends, so there is no distant vegetation cutoff to discover.
    float fog = smoothstep(10.0, 30.0, vViewDepth);
    color = mix(color, fogColor, fog);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createMaterial(
  vertexShader: string,
  fragmentShader: string,
  dark: boolean,
  alpha?: THREE.Texture,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDark: { value: dark ? 1 : 0 },
      uTime: { value: 0 },
      uAlpha: { value: alpha ?? new THREE.Texture() },
      // The landscape must converge on the SAME horizon fog as the rest of
      // the scene. A copied hex immediately becomes a visible back seam when
      // art direction retunes the sky, which is exactly what this topology is
      // designed to prevent.
      uFogLight: { value: new THREE.Color(PALETTES.light.fog) },
      uFogDark: { value: new THREE.Color(PALETTES.dark.fog) },
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
}

export default function Meadow({
  dark,
  simplify,
}: {
  dark: boolean;
  simplify: boolean;
}) {
  const terrain = useMemo(makeTerrainGeometry, []);
  const tuftGeometry = useMemo(makeTuftGeometry, []);
  const tuftTexture = useMemo(makeTuftTexture, []);
  const terrainMaterial = useMemo(
    () => createMaterial(TERRAIN_VERTEX, TERRAIN_FRAGMENT, dark),
    // Theme transitions happen through uDark; remounting would make them snap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const grassMaterial = useMemo(
    () => createMaterial(GRASS_VERTEX, GRASS_FRAGMENT, dark, tuftTexture),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const flowerGeometry = useMemo(() => {
    const positions = new Float32Array(FLOWER_COUNT * 3);
    const colors = new Float32Array(FLOWER_COUNT * 3);
    const palette = ["#f4c6d7", "#f2b84b", "#d6c2ee", "#fff0d1"];
    for (let i = 0; i < FLOWER_COUNT; i++) {
      const x = VEGETATION_LEFT + rand(i, 51) * VEGETATION_WIDTH;
      const depth = 0.035 + Math.pow(rand(i, 52), 1.2) * 0.925;
      const z = VEGETATION_NEAR_Z - depth * VEGETATION_DEPTH;
      positions[i * 3] = x;
      positions[i * 3 + 1] = meadowHeight(x, z) + 0.075;
      positions[i * 3 + 2] = z;
      const color = new THREE.Color(palette[i % palette.length]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }, []);

  useEffect(() => {
    const mesh = grassRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const rotation = new THREE.Euler();
    for (let i = 0; i < GRASS_COUNT; i++) {
      const x = VEGETATION_LEFT + rand(i, 31) * VEGETATION_WIDTH;
      const depth = 0.02 + Math.pow(rand(i, 32), 1.13) * 0.965;
      const z = VEGETATION_NEAR_Z - depth * VEGETATION_DEPTH;
      position.set(x, meadowHeight(x, z), z);
      rotation.set(0, rand(i, 33) * Math.PI * 2, 0);
      quaternion.setFromEuler(rotation);
      const s = 0.72 + rand(i, 34) * 0.68;
      scale.set(s, s * (0.78 + rand(i, 35) * 0.5), s);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);

  useEffect(
    () => () => {
      terrain.dispose();
      tuftGeometry.dispose();
      tuftTexture.dispose();
      terrainMaterial.dispose();
      grassMaterial.dispose();
      flowerGeometry.dispose();
    },
    [
      flowerGeometry,
      grassMaterial,
      terrain,
      terrainMaterial,
      tuftGeometry,
      tuftTexture,
    ],
  );

  useFrame(({ clock }, delta) => {
    const target = dark ? 1 : 0;
    terrainMaterial.uniforms.uDark!.value = THREE.MathUtils.damp(
      terrainMaterial.uniforms.uDark!.value as number,
      target,
      3.5,
      delta,
    );
    const themeMix = terrainMaterial.uniforms.uDark!.value as number;
    grassMaterial.uniforms.uDark!.value = themeMix;
    grassMaterial.uniforms.uTime!.value = clock.elapsedTime;
  });

  return (
    <group>
      <mesh geometry={terrain} material={terrainMaterial} receiveShadow />
      {!simplify && (
        <>
          <instancedMesh
            ref={grassRef}
            args={[tuftGeometry, grassMaterial, GRASS_COUNT]}
            frustumCulled={false}
          />
          <points geometry={flowerGeometry}>
            <pointsMaterial
              map={poolTexture()}
              size={0.055}
              vertexColors
              transparent
              opacity={dark ? 0.58 : 0.9}
              alphaTest={0.08}
              depthWrite={false}
              sizeAttenuation
              toneMapped
            />
          </points>
        </>
      )}
    </group>
  );
}
