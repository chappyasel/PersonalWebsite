"use client";

import { projectArtifactInspectionLighting } from "../scene/projectArtifactLighting";
import { ProjectIconVisual } from "../scene/units/ProjectArtifacts";
import { PROJECT_ARTIFACT_DIMENSIONS } from "../scene/units/unitShelfLayout";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";

import type { ModelArtifactCameraTarget } from "./modelArtifactHandoff";

function HomeworkIcon({
  dark,
  onReady,
  measureRef,
}: {
  dark: boolean;
  onReady: (target: ModelArtifactCameraTarget) => void;
  measureRef: MutableRefObject<() => void>;
}) {
  const group = useRef<THREE.Group>(null);
  const artworkReady = useRef(false);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const measure = useCallback(() => {
    if (!artworkReady.current || !group.current) return;
    group.current.updateWorldMatrix(true, true);
    camera.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group.current);
    if (box.isEmpty()) return;
    const canvas = gl.domElement.getBoundingClientRect();
    const min = new THREE.Vector2(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    const max = new THREE.Vector2(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(camera);
          min.x = Math.min(
            min.x,
            canvas.left + (point.x * 0.5 + 0.5) * canvas.width,
          );
          min.y = Math.min(
            min.y,
            canvas.top + (-point.y * 0.5 + 0.5) * canvas.height,
          );
          max.x = Math.max(
            max.x,
            canvas.left + (point.x * 0.5 + 0.5) * canvas.width,
          );
          max.y = Math.max(
            max.y,
            canvas.top + (-point.y * 0.5 + 0.5) * canvas.height,
          );
        }
    const modelWorld = new THREE.Quaternion();
    const cameraWorldInverse = new THREE.Quaternion();
    group.current.getWorldQuaternion(modelWorld);
    camera.getWorldQuaternion(cameraWorldInverse).invert();
    cameraWorldInverse.multiply(modelWorld);
    onReady({
      bounds: {
        left: min.x,
        top: min.y,
        width: max.x - min.x,
        height: max.y - min.y,
      },
      cameraRelativeQuaternion: [
        cameraWorldInverse.x,
        cameraWorldInverse.y,
        cameraWorldInverse.z,
        cameraWorldInverse.w,
      ],
    });
  }, [camera, gl, onReady]);
  const reportReady = useCallback(() => {
    artworkReady.current = true;
    measure();
  }, [measure]);

  useEffect(() => {
    measureRef.current = measure;
    return () => {
      measureRef.current = () => undefined;
    };
  }, [measure, measureRef]);

  useEffect(() => {
    if (!artworkReady.current) return;
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [measure, size.height, size.width]);

  return (
    <group ref={group} position={[0, -PROJECT_ARTIFACT_DIMENSIONS.icon / 2, 0]}>
      <ProjectIconVisual
        unitIndex={0}
        dark={dark}
        hoverKey="grab:projects:homework-icon"
        artwork="/images/stacks/v8/projects-homework-icon.webp"
        fallbackColor="#12ace8"
        textured
        yaw={-0.07}
        interactive={false}
        onReady={reportReady}
      />
    </group>
  );
}

function ContextLossReporter({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener("webglcontextlost", handleLost, { once: true });
    return () => canvas.removeEventListener("webglcontextlost", handleLost);
  }, [gl, onLost]);
  return null;
}

function InspectionExposure({ exposure }: { exposure: number }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [exposure, gl]);
  return null;
}

export default function ModelArtifactStage({
  dark,
  interactive,
  onReady,
  onBackgroundClick,
  onRendererFailure,
}: {
  dark: boolean;
  interactive: boolean;
  onReady: (target: ModelArtifactCameraTarget) => void;
  onBackgroundClick: () => void;
  onRendererFailure: () => void;
}) {
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const measure = useRef<() => void>(() => undefined);
  const pointer = useRef({ x: 0, y: 0, moved: false, lastTap: 0 });
  const lighting = useMemo(
    () => projectArtifactInspectionLighting(dark),
    [dark],
  );

  const reset = useCallback(() => controls.current?.reset(), []);

  return (
    <div
      data-model-artifact-stage
      role="group"
      aria-label="Interactive 3D model of the Homework app icon. Drag to rotate, pinch or scroll to zoom, and double-tap to reset."
      aria-disabled={!interactive}
      tabIndex={interactive ? 0 : -1}
      className="size-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 active:cursor-grabbing"
      onDoubleClick={() => {
        if (interactive) reset();
      }}
      onKeyDown={(event) => {
        if (interactive && event.key.toLowerCase() === "r") reset();
      }}
      onPointerDown={(event) => {
        if (!interactive) return;
        pointer.current.x = event.clientX;
        pointer.current.y = event.clientY;
        pointer.current.moved = false;
        event.currentTarget.focus({ preventScroll: true });
      }}
      onPointerMove={(event) => {
        if (!interactive) return;
        if (
          Math.hypot(
            event.clientX - pointer.current.x,
            event.clientY - pointer.current.y,
          ) > 8
        )
          pointer.current.moved = true;
      }}
      onPointerUp={() => {
        if (!interactive) return;
        const now = performance.now();
        if (!pointer.current.moved && now - pointer.current.lastTap < 320)
          reset();
        pointer.current.lastTap = pointer.current.moved ? 0 : now;
      }}
    >
      <Canvas
        data-model-artifact-canvas
        frameloop="demand"
        onPointerMissed={() => {
          if (interactive) onBackgroundClick();
        }}
        dpr={[1, 1.75]}
        camera={{ position: [0.48, 0.16, 1.05], fov: 28, near: 0.05, far: 8 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = lighting.exposure;
        }}
      >
        <ContextLossReporter onLost={onRendererFailure} />
        <InspectionExposure exposure={lighting.exposure} />
        <hemisphereLight
          color={lighting.hemisphere.color}
          groundColor={lighting.hemisphere.groundColor}
          intensity={lighting.hemisphere.intensity}
        />
        <directionalLight
          color={lighting.key.color}
          intensity={lighting.key.intensity}
          position={lighting.key.position}
        />
        <Environment
          resolution={128}
          environmentIntensity={lighting.environmentIntensity}
        >
          <Lightformer
            form="rect"
            color={lighting.warmEnvironment.color}
            intensity={lighting.warmEnvironment.intensity}
            position={lighting.warmEnvironment.position}
            scale={10}
            target={[0, 0, 0]}
          />
          <Lightformer
            form="rect"
            color={lighting.coolEnvironment.color}
            intensity={lighting.coolEnvironment.intensity}
            position={lighting.coolEnvironment.position}
            scale={8}
            target={[0, 0, 0]}
          />
          <Lightformer
            form="circle"
            color={lighting.groundEnvironment.color}
            intensity={lighting.groundEnvironment.intensity}
            position={lighting.groundEnvironment.position}
            scale={8}
            target={[0, 0, 0]}
          />
        </Environment>
        <HomeworkIcon dark={dark} onReady={onReady} measureRef={measure} />
        <OrbitControls
          ref={controls}
          makeDefault
          target={[0, 0, 0]}
          enablePan={false}
          enabled={interactive}
          enableDamping
          dampingFactor={0.085}
          rotateSpeed={0.72}
          zoomSpeed={0.62}
          minDistance={0.62}
          maxDistance={1.65}
          onEnd={() => measure.current()}
        />
      </Canvas>
    </div>
  );
}
