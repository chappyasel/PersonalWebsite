"use client";

import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { GOLF_CUP } from "./golf/golfCourse";
import { GOLF_FOG_POLICY } from "./golf/golfPresentation";
import { useResolvedMeadowVisibility } from "./scenePerformance";

const FLAG_URL = "/models/golf-flag.glb";
const FLAG_LOGO_URL = "/images/stacks/reginald-solo-logo.webp";

/** The Poly Pizza flag keeps its authored pole and colors while its cloth
 * receives a lightweight vertex ripple. Only the named cloth mesh is bent;
 * the pole remains a stable target for the golf shots. */
export default function WavingGolfFlag({
  dark,
  position,
  rotation = [0, 0, 0],
  scale = 0.38,
}: {
  dark: boolean;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  const meadowVisible = useResolvedMeadowVisibility();
  const gltf = useGLTF(FLAG_URL);
  const logo = useTexture(FLAG_LOGO_URL);
  useEffect(() => {
    logo.colorSpace = THREE.SRGBColorSpace;
    logo.flipY = false;
    logo.needsUpdate = true;
  }, [logo]);
  const timeUniforms = useRef<Array<{ value: number }>>([]);
  const materials = useRef<THREE.Material[]>([]);
  const scene = useMemo(() => {
    timeUniforms.current = [];
    materials.current = [];
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = true;
      const material = (node.material as THREE.MeshStandardMaterial).clone();
      materials.current.push(material);
      node.material = material;
      // The source asset is authored as one blue material and distant meadow
      // fog collapses that and the pole to the same horizon tint. Rebuild the
      // cloth color below from the logo luminance so its purple field, white
      // bird and orange crown remain separate after the night fog pass.
      material.fog = GOLF_FOG_POLICY.flag(dark);
      material.metalness = 0.04;
      material.roughness = 0.72;
      if (!node.name.includes("Flag_of_Portugal")) {
        // The authored pole mesh includes a large finial sphere and is almost
        // four inches thick at scene scale. Replace it below with a clean,
        // narrow course pin.
        node.visible = false;
        return;
      }
      // Shrink the cloth around its hoist edge, not its center, so it stays
      // attached to the replacement pole while becoming 70% of the source
      // rectangle in both dimensions.
      node.scale.multiplyScalar(0.7);
      node.position.x -= 0.296;
      node.position.y += 0.274;
      material.color.set("#ffffff");
      material.map = logo;
      const time = { value: 0 };
      timeUniforms.current.push(time);
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uFlagTime = time;
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform float uFlagTime;",
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
             float flagReach = smoothstep(-0.82, 0.72, position.x);
             float flagWave = sin(uFlagTime * 3.2 + position.x * 7.0 + position.y * 1.4);
             transformed.z += flagWave * flagReach * 0.15;
             transformed.y += sin(uFlagTime * 4.1 + position.x * 8.5) * flagReach * 0.035;`,
          );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `#ifdef USE_MAP
               vec4 logoSample = texture2D(map, vMapUv);
               vec3 royalPurple = vec3(${dark ? "0.23, 0.12, 0.32" : "0.435, 0.176, 0.659"});
               float logoInk = smoothstep(0.06, 0.22, max(logoSample.r, max(logoSample.g, logoSample.b)));
               diffuseColor.rgb = mix(royalPurple, logoSample.rgb, logoInk);
               diffuseColor.rgb *= ${dark ? "0.72" : "0.92"};
               diffuseColor.a = 1.0;
             #endif`,
        );
      };
      material.customProgramCacheKey = () =>
        `waving-golf-flag-v4-${dark ? "dark" : "light"}`;
      material.needsUpdate = true;
    });
    return clone;
  }, [dark, gltf.scene, logo]);

  useEffect(() => {
    // Capture this clone's materials. Reading the mutable ref in cleanup can
    // dispose the next clone's materials after an HMR/asset identity change.
    const ownedMaterials = [...materials.current];
    return () => {
      for (const material of ownedMaterials) material.dispose();
    };
  }, [scene]);
  useFrame(({ clock }) => {
    for (const uniform of timeUniforms.current)
      uniform.value = clock.elapsedTime;
  });

  return (
    <group position={position}>
      {/* Public position is the actual pole axis and cup centre. The source
          GLB's pole lived at (-.719, 0, .065); counter-offsetting the visual
          subtree removes that asset-origin leak from every caller. */}
      <group
        position={[0.719 * scale, 0, -0.065 * scale]}
        rotation={rotation}
        scale={scale}
      >
        <primitive object={scene} />
        <mesh castShadow position={[-0.719, 1.991, 0.065]}>
          <cylinderGeometry args={[0.026, 0.026, 3.982, 10]} />
          <meshStandardMaterial
            color={dark ? "#58636a" : "#e8e1d2"}
            fog={GOLF_FOG_POLICY.flag(dark)}
            metalness={0.04}
            roughness={0.72}
          />
        </mesh>
      </group>
      {meadowVisible ? (
        <>
          <mesh position={[0, -GOLF_CUP.depth / 2, 0]}>
            <cylinderGeometry
              args={[
                GOLF_CUP.radius,
                GOLF_CUP.radius * 0.92,
                GOLF_CUP.depth,
                32,
                1,
                true,
              ]}
            />
            <meshStandardMaterial
              color={dark ? "#111613" : "#30372f"}
              roughness={1}
              side={THREE.BackSide}
            />
          </mesh>
          <mesh
            position={[0, -GOLF_CUP.depth + 0.002, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[GOLF_CUP.radius * 0.92, 32]} />
            <meshStandardMaterial
              color={dark ? "#020303" : "#080a08"}
              roughness={1}
            />
          </mesh>
          <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry
              args={[GOLF_CUP.radius * 0.985, GOLF_CUP.radius * 1.08, 32]}
            />
            <meshStandardMaterial
              color={dark ? "#334329" : "#48623a"}
              roughness={0.94}
            />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

useGLTF.preload(FLAG_URL);
useTexture.preload(FLAG_LOGO_URL);
