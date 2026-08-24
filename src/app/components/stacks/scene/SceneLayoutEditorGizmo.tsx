"use client";

import { Line, PivotControls, ScreenSizer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";

import { sceneLayoutEditorController } from "./sceneLayoutEditor";

const GIZMO_SIZE = 108;
const GIZMO_OPACITY = 0.4;
const HOVERED_COLOR = "#ffff40";
const AXIS_COLORS = ["#ff2060", "#20df80", "#2080ff"] as const;
const ALIGNMENT_GUIDE_EXTENT = 10_000;
const ROTATION_GUIDE_RADIUS = 0.65;
const PLANE_GRID_EXTENT = 5;
const PLANE_GRID_STEP = 0.25;
const ALIGNMENT_GUIDE_POINTS = [
  [
    [-ALIGNMENT_GUIDE_EXTENT, 0, 0],
    [ALIGNMENT_GUIDE_EXTENT, 0, 0],
  ],
  [
    [0, -ALIGNMENT_GUIDE_EXTENT, 0],
    [0, ALIGNMENT_GUIDE_EXTENT, 0],
  ],
  [
    [0, 0, -ALIGNMENT_GUIDE_EXTENT],
    [0, 0, ALIGNMENT_GUIDE_EXTENT],
  ],
] as const;

type AxisIndex = 0 | 1 | 2;
type HoveredControl = {
  kind: "axis" | "plane" | "rotation";
  axis: AxisIndex;
};

type RenderableObject = THREE.Object3D & {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
};

function rotationGuidePoints(axis: AxisIndex) {
  return Array.from({ length: 97 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2;
    const first = Math.cos(angle) * ROTATION_GUIDE_RADIUS;
    const second = Math.sin(angle) * ROTATION_GUIDE_RADIUS;
    if (axis === 0) return [0, first, second] as const;
    if (axis === 1) return [first, 0, second] as const;
    return [first, second, 0] as const;
  });
}

function planeGridPoints(axis: AxisIndex) {
  const points: [number, number, number][] = [];
  const divisions = Math.round(PLANE_GRID_EXTENT / PLANE_GRID_STEP);
  for (let index = -divisions; index <= divisions; index += 1) {
    const offset = index * PLANE_GRID_STEP;
    if (axis === 0) {
      points.push(
        [0, offset, -PLANE_GRID_EXTENT],
        [0, offset, PLANE_GRID_EXTENT],
        [0, -PLANE_GRID_EXTENT, offset],
        [0, PLANE_GRID_EXTENT, offset],
      );
    } else if (axis === 1) {
      points.push(
        [offset, 0, -PLANE_GRID_EXTENT],
        [offset, 0, PLANE_GRID_EXTENT],
        [-PLANE_GRID_EXTENT, 0, offset],
        [PLANE_GRID_EXTENT, 0, offset],
      );
    } else {
      points.push(
        [offset, -PLANE_GRID_EXTENT, 0],
        [offset, PLANE_GRID_EXTENT, 0],
        [-PLANE_GRID_EXTENT, offset, 0],
        [PLANE_GRID_EXTENT, offset, 0],
      );
    }
  }
  return points;
}

const ROTATION_GUIDE_POINTS = [
  rotationGuidePoints(0),
  rotationGuidePoints(1),
  rotationGuidePoints(2),
] as const;
const PLANE_GRID_POINTS = [
  planeGridPoints(0),
  planeGridPoints(1),
  planeGridPoints(2),
] as const;

const controlDirection = new THREE.Vector3();
const controlWorldQuaternion = new THREE.Quaternion();
const pivotWorldQuaternion = new THREE.Quaternion();
const pivotWorldQuaternionInverse = new THREE.Quaternion();
const guideScale = new THREE.Vector3(1, 1, 1);
const hoveredColor = new THREE.Color(HOVERED_COLOR);

function isMesh(
  object: THREE.Object3D,
): object is THREE.Mesh<
  THREE.BufferGeometry,
  THREE.Material | THREE.Material[]
> {
  return object instanceof THREE.Mesh;
}

function isLine2(object: THREE.Object3D): object is RenderableObject {
  return object.type === "Line2";
}

function hasHoveredMaterial(object: RenderableObject) {
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return materials.some(
    (material) =>
      "color" in material &&
      material.color instanceof THREE.Color &&
      material.color.getHex() === hoveredColor.getHex(),
  );
}

function localAxisForDirection(
  pivot: THREE.Group,
  object: THREE.Object3D,
  direction: THREE.Vector3,
): AxisIndex {
  pivot.getWorldQuaternion(pivotWorldQuaternion);
  pivotWorldQuaternionInverse.copy(pivotWorldQuaternion).invert();
  object.getWorldQuaternion(controlWorldQuaternion);
  controlDirection
    .copy(direction)
    .applyQuaternion(controlWorldQuaternion)
    .applyQuaternion(pivotWorldQuaternionInverse);

  const components = [
    Math.abs(controlDirection.x),
    Math.abs(controlDirection.y),
    Math.abs(controlDirection.z),
  ];
  return components.indexOf(Math.max(...components)) as AxisIndex;
}

function hoveredControl(pivot: THREE.Group | null): HoveredControl | null {
  if (!pivot) return null;

  let hoveredCone: RenderableObject | null = null;
  let hoveredPlane: RenderableObject | null = null;
  let hoveredArc: RenderableObject | null = null;
  pivot.traverse((object) => {
    if (isMesh(object) && hasHoveredMaterial(object)) {
      if (object.geometry.type === "ConeGeometry") hoveredCone = object;
      if (object.geometry.type === "PlaneGeometry") hoveredPlane = object;
    } else if (
      object.visible &&
      isLine2(object) &&
      hasHoveredMaterial(object)
    ) {
      hoveredArc = object;
    }
  });
  if (hoveredCone) {
    return {
      kind: "axis",
      axis: localAxisForDirection(
        pivot,
        hoveredCone,
        new THREE.Vector3(0, 1, 0),
      ),
    };
  }
  if (hoveredPlane) {
    return {
      kind: "plane",
      axis: localAxisForDirection(
        pivot,
        hoveredPlane,
        new THREE.Vector3(0, 0, 1),
      ),
    };
  }
  if (hoveredArc) {
    return {
      kind: "rotation",
      axis: localAxisForDirection(
        pivot,
        hoveredArc,
        new THREE.Vector3(0, 0, 1),
      ),
    };
  }
  return null;
}

function sameHoveredControl(
  first: HoveredControl | null,
  second: HoveredControl | null,
) {
  return first?.kind === second?.kind && first?.axis === second?.axis;
}

export default function SceneLayoutEditorGizmo() {
  const snapshot = useSyncExternalStore(
    sceneLayoutEditorController.subscribe,
    sceneLayoutEditorController.getSnapshot,
    sceneLayoutEditorController.getSnapshot,
  );
  const root = sceneLayoutEditorController.selectedRoot();
  const selected = snapshot.records.find(
    (record) => record.id === snapshot.selectedId,
  );
  const position = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const rotation = useMemo(() => new THREE.Euler(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const guideMatrix = useMemo(() => new THREE.Matrix4(), []);
  const directionControls = useRef<THREE.Group>(null);
  const hoveredControlRef = useRef<HoveredControl | null>(null);
  const [activeHoverGuide, setActiveHoverGuide] =
    useState<HoveredControl | null>(null);

  useFrame(() => {
    const nextHoveredControl = hoveredControl(directionControls.current);
    if (sameHoveredControl(nextHoveredControl, hoveredControlRef.current)) return;
    hoveredControlRef.current = nextHoveredControl;
    setActiveHoverGuide(nextHoveredControl);
  });

  if (!snapshot.enabled || !snapshot.selectedId || !root) return null;

  root.updateMatrix();
  root.matrix.decompose(position, quaternion, scale);
  guideMatrix.compose(position, quaternion, guideScale);
  const updateTransform = (matrix: THREE.Matrix4) => {
    matrix.decompose(position, quaternion, scale);
    rotation.setFromQuaternion(quaternion, root.rotation.order);
    sceneLayoutEditorController.updateTransform(snapshot.selectedId!, {
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z],
    });
  };
  const updateUniformScale = (matrix: THREE.Matrix4) => {
    matrix.decompose(position, quaternion, scale);
    const currentRootScale = Math.max(0.0001, root.scale.x);
    const currentPreviewScale = selected?.previewScale ?? 1;
    sceneLayoutEditorController.updateScale(
      snapshot.selectedId!,
      currentPreviewScale * (scale.x / currentRootScale),
    );
  };

  return (
    <>
      <PivotControls
        ref={directionControls}
        key={`${snapshot.selectedId}:direction`}
        matrix={root.matrix}
        autoTransform={false}
        fixed
        // Fixed PivotControls measures this value in screen pixels. The old
        // TransformControls used a unitless 0.72; carrying that number over
        // collapsed every handle onto the origin.
        scale={GIZMO_SIZE}
        opacity={GIZMO_OPACITY}
        axisColors={[...AXIS_COLORS]}
        hoveredColor={HOVERED_COLOR}
        depthTest={false}
        disableScaling
        onDragStart={() => sceneLayoutEditorController.setGestureActive(true)}
        onDrag={updateTransform}
        onDragEnd={() => sceneLayoutEditorController.setGestureActive(false)}
      />
      {activeHoverGuide?.kind === "axis" ? (
        <group matrix={guideMatrix} matrixAutoUpdate={false}>
          <Line
            points={ALIGNMENT_GUIDE_POINTS[activeHoverGuide.axis]}
            color={AXIS_COLORS[activeHoverGuide.axis]}
            lineWidth={1.5}
            transparent
            opacity={0.3}
            depthTest={false}
            raycast={() => null}
            renderOrder={1_000}
            fog={false}
          />
        </group>
      ) : null}
      {activeHoverGuide?.kind === "rotation" ? (
        <group matrix={guideMatrix} matrixAutoUpdate={false}>
          <ScreenSizer scale={GIZMO_SIZE}>
            <Line
              points={ROTATION_GUIDE_POINTS[activeHoverGuide.axis]}
              color={AXIS_COLORS[activeHoverGuide.axis]}
              lineWidth={1.5}
              transparent
              opacity={0.3}
              depthTest={false}
              raycast={() => null}
              renderOrder={1_000}
              fog={false}
            />
          </ScreenSizer>
        </group>
      ) : null}
      {activeHoverGuide?.kind === "plane" ? (
        <group matrix={guideMatrix} matrixAutoUpdate={false}>
          <Line
            points={PLANE_GRID_POINTS[activeHoverGuide.axis]}
            segments
            color={AXIS_COLORS[activeHoverGuide.axis]}
            lineWidth={0.75}
            transparent
            opacity={0.18}
            depthTest={false}
            raycast={() => null}
            renderOrder={999}
            fog={false}
          />
        </group>
      ) : null}
      <PivotControls
        key={`${snapshot.selectedId}:uniform-scale`}
        matrix={root.matrix}
        autoTransform={false}
        fixed
        scale={GIZMO_SIZE}
        opacity={GIZMO_OPACITY}
        hoveredColor={HOVERED_COLOR}
        depthTest={false}
        disableAxes
        disableSliders
        disableRotations
        activeAxes={[true, false, false]}
        axisColors={["#f8fafc", "#f8fafc", "#f8fafc"]}
        scaleLimits={[
          [0.05, 10],
          undefined,
          undefined,
        ]}
        onDragStart={() => sceneLayoutEditorController.setGestureActive(true)}
        onDrag={updateUniformScale}
        onDragEnd={() => sceneLayoutEditorController.setGestureActive(false)}
      />
    </>
  );
}
