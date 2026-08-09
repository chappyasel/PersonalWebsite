"use client";

// Atmosphere for The Stacks — gradient sky dome, fog-matched palette,
// hemisphere fill, camera-tracking key light with soft shadows, and dust.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { type Palette, rand } from "../theme";
import { MID_X, TRAVEL_X } from "./worldLayout";

// Vertical mix from horizon to zenith; fog handles the distance falloff.
function SkyDome({ palette }: { palette: Palette }) {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(palette.skyTop) },
        horizon: { value: new THREE.Color(palette.skyHorizon) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 horizon;
        varying vec3 vWorld;
        void main() {
          float h = clamp((vWorld.y + 3.0) / 10.0, 0.0, 1.0);
          vec3 col = mix(horizon, top, smoothstep(0.0, 1.0, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, [palette]);
  return (
    <mesh position={[MID_X, 0, 0]} material={material}>
      <sphereGeometry args={[34, 32, 24]} />
    </mesh>
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
        opacity={0.45}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// Warm key light casting onto the invisible catcher plane. Follows the camera
// laterally so the tight (high-resolution) shadow frustum covers all 7 units.
function KeyLight({ dark, castShadows }: { dark: boolean; castShadows: boolean }) {
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
      castShadow={castShadows}
      position={[4, 6.5, 6]}
      intensity={dark ? 1.15 : 1.35}
      color={dark ? "#e8b57e" : "#ffe9cb"}
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-camera-left={-10}
      shadow-camera-right={10}
      shadow-camera-top={6}
      shadow-camera-bottom={-6}
      shadow-camera-near={1}
      shadow-camera-far={25}
    />
  );
}

export default function SceneEnvironment({
  palette,
  dark,
  dustOff,
  shadowsOff,
}: {
  palette: Palette;
  dark: boolean;
  dustOff?: boolean;
  shadowsOff?: boolean;
}) {
  return (
    <>
      <fog attach="fog" args={[palette.fog, 8, 24]} />
      <SkyDome palette={palette} />
      <hemisphereLight
        color={dark ? "#a8825c" : "#fff2df"}
        groundColor={dark ? "#2a1c10" : "#b08c66"}
        intensity={dark ? 0.95 : 1.05}
      />
      <KeyLight dark={dark} castShadows={!shadowsOff} />
      {!dustOff && <Dust palette={palette} />}
    </>
  );
}
