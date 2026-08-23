"use client";

import { useFrame } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";

import {
  type SceneInteractionSpec,
  sceneInteractionInventory,
} from "./interactionRegistry";
import {
  DYNAMIC_COLLIDER_HORIZONTAL_INSET,
  type OrientedBoxCollider,
  extractDynamicColliderBoxes,
} from "./physicsColliders";
import { physicsDiagnosticsController } from "./physicsDiagnostics";

export function physicsHelpersVisible(snapshot: { showHelpers: boolean }) {
  return snapshot.showHelpers;
}

export function allPhysicsBoundsVisible(snapshot: { showAllBounds: boolean }) {
  return snapshot.showAllBounds;
}

function boundsColor(spec: SceneInteractionSpec) {
  if (spec.activation?.kind === "door") return "#ff4dc4";
  if (spec.activation?.kind === "action") return "#b48cff";
  if (spec.activation?.kind === "egg") return "#ff9d4d";
  if (spec.activation?.kind === "artifact") return "#58d5a7";
  if (spec.movable) return "#44d7ff";
  return "#d8e0e8";
}

function staggerSeconds(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index++)
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return (Math.abs(hash) % 30) / 60;
}

function InteractionBounds({ spec }: { spec: SceneInteractionSpec }) {
  const root = useRef<THREE.Group>(null);
  const [parts, setParts] = useState<OrientedBoxCollider[]>([]);
  const inspected = useRef(false);
  const inspectAfter = useRef(staggerSeconds(spec.id));
  const color = boundsColor(spec);
  useFrame(({ clock }) => {
    const helperRoot = root.current;
    if (!helperRoot) return;
    spec.root.updateWorldMatrix(true, true);
    helperRoot.matrix.copy(spec.root.matrixWorld);
    helperRoot.matrixWorldNeedsUpdate = true;
    helperRoot.visible = spec.root.visible;
    if (!inspected.current && clock.elapsedTime >= inspectAfter.current) {
      const extraction = extractDynamicColliderBoxes(
        spec.root,
        spec.movable?.colliderProfile,
      );
      if (extraction.boxes.length) {
        inspected.current = true;
        setParts(extraction.boxes);
      } else {
        // Suspended GLBs attach after the interaction wrapper registers. Poll
        // gently until geometry exists instead of traversing every prop on
        // every rendered frame while this diagnostic is enabled.
        inspectAfter.current = clock.elapsedTime + 0.25;
      }
    }
  });
  return (
    <group
      ref={root}
      matrixAutoUpdate={false}
      name={`physics-prop-collider:${spec.id}`}
      renderOrder={10_001}
    >
      {parts.map((part, index) => (
        <mesh
          key={`${part.source}:${index}`}
          position={part.offset}
          quaternion={part.quaternion}
          raycast={() => null}
        >
          <boxGeometry
            args={[
              part.halfExtents.x * 2 * DYNAMIC_COLLIDER_HORIZONTAL_INSET,
              part.halfExtents.y * 2,
              part.halfExtents.z * 2 * DYNAMIC_COLLIDER_HORIZONTAL_INSET,
            ]}
          />
          <meshBasicMaterial
            color={color}
            wireframe
            transparent
            opacity={0.9}
            depthTest={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Segment({
  from,
  to,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}) {
  const geometry = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...from),
        new THREE.Vector3(...to),
      ]),
    [from, to],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={color} depthTest={false} />
    </lineSegments>
  );
}

export default function PhysicsDiagnosticsOverlay() {
  const snapshot = useSyncExternalStore(
    physicsDiagnosticsController.subscribe,
    physicsDiagnosticsController.getSnapshot,
    physicsDiagnosticsController.getSnapshot,
  );
  const showHelpers = physicsHelpersVisible(snapshot);
  const showAllBounds = allPhysicsBoundsVisible(snapshot);
  if (!showHelpers && !showAllBounds) return null;
  const { helpers } = snapshot;
  const interactions = showAllBounds ? sceneInteractionInventory() : [];
  return (
    <group name="physics-diagnostics" renderOrder={10000}>
      {interactions.map((spec) => (
        <InteractionBounds key={spec.id} spec={spec} />
      ))}
      {showHelpers
        ? helpers.hulls.map((hull, index) => (
            <mesh
              key={`hull:${index}`}
              position={hull.position}
              quaternion={hull.quaternion}
              raycast={() => null}
            >
              <boxGeometry
                args={[
                  hull.halfExtents[0] * 2,
                  hull.halfExtents[1] * 2,
                  hull.halfExtents[2] * 2,
                ]}
              />
              <meshBasicMaterial
                color="#44d7ff"
                wireframe
                transparent
                opacity={0.75}
                depthTest={false}
              />
            </mesh>
          ))
        : null}
      {showHelpers &&
        (
          [
            [helpers.desired, "#ff4dc4"],
            [helpers.accepted, "#52ff91"],
            [helpers.lastSafe, "#ffd84d"],
          ] as const
        ).map(([point, color], index) =>
          point ? (
            <mesh key={`pose:${index}`} position={point} raycast={() => null}>
              <sphereGeometry args={[0.018, 8, 6]} />
              <meshBasicMaterial color={color} depthTest={false} />
            </mesh>
          ) : null,
        )}
      {showHelpers &&
        helpers.contacts.map((point, index) => (
          <mesh key={`contact:${index}`} position={point} raycast={() => null}>
            <sphereGeometry args={[0.012, 8, 6]} />
            <meshBasicMaterial color="#ff554d" depthTest={false} />
          </mesh>
        ))}
      {showHelpers &&
        helpers.normals.map((normal, index) => (
          <Segment
            key={`normal:${index}`}
            from={normal.origin}
            to={new THREE.Vector3(...normal.origin)
              .addScaledVector(new THREE.Vector3(...normal.direction), 0.18)
              .toArray()}
            color="#5ca8ff"
          />
        ))}
      {showHelpers && helpers.accepted ? (
        <Segment
          from={helpers.accepted}
          to={new THREE.Vector3(...helpers.accepted)
            .addScaledVector(new THREE.Vector3(...helpers.velocity), 0.08)
            .toArray()}
          color="#ffffff"
        />
      ) : null}
    </group>
  );
}
