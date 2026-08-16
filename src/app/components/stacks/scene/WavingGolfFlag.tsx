"use client";

import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

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
      // fog collapses that and the pole to the same horizon tint. Keep the
      // target readable: a warm neutral pole and a high-contrast three-panel
      // golf flag, both exempt from the final fog wash at this small scale.
      // At night the flag needs to inherit the same depth cue as the hills.
      // Keeping it exempt from fog made the white logo read like a light.
      material.fog = dark;
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
               vec3 royalPurple = vec3(0.435, 0.176, 0.659);
               diffuseColor.rgb = mix(royalPurple, logoSample.rgb, logoSample.a);
               diffuseColor.rgb *= ${dark ? "0.64" : "0.92"};
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
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={scene} />
      <mesh castShadow position={[-0.719, 1.991, 0.065]}>
        <cylinderGeometry args={[0.026, 0.026, 3.982, 10]} />
        <meshStandardMaterial
          color={dark ? "#70665c" : "#e8e1d2"}
          fog={dark}
          metalness={0.04}
          roughness={0.72}
        />
      </mesh>
    </group>
  );
}

useGLTF.preload(FLAG_URL);
useTexture.preload(FLAG_LOGO_URL);
