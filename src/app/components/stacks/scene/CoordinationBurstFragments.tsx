"use client";

import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  COORDINATION_FRAGMENT_DURATION,
  sampleCoordinationFragment,
} from "./coordinationBurstMotion";
import {
  COORDINATION_AGENT_COLOR,
  COORDINATION_HUMAN_COLOR,
  type CoordinationBurst,
  createCoordinationNetwork,
} from "./coordinationNetwork";
import { useUnitFrame } from "./unitActivity";

const NO_RAYCAST = () => null;

/** Mounted only while the live burst effect is enabled. The captured world transform
 * keeps debris at its release point while preserving unit visibility and cleanup. */
export function CoordinationBurstFragments({
  burstSignal,
}: {
  burstSignal: RefObject<CoordinationBurst>;
}) {
  const emitter = useRef<THREE.Group>(null);
  const debris = useRef<THREE.Group>(null);
  const shards = useRef<THREE.InstancedMesh>(null);
  const trails = useRef<THREE.InstancedMesh>(null);
  const shardMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const trailMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const handledRevision = useRef(0);
  const age = useRef(COORDINATION_FRAGMENT_DURATION);
  const nodes = useMemo(() => createCoordinationNetwork().nodes, []);
  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      releaseWorld: new THREE.Matrix4(),
      white: new THREE.Color("#ffffff"),
      position: new THREE.Vector3(),
      tail: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
      color: new THREE.Color(),
      headSample: { x: 0, y: 0, z: 0, scale: 0 },
      tailSample: { x: 0, y: 0, z: 0, scale: 0 },
    }),
    [],
  );

  useLayoutEffect(() => {
    nodes.forEach((node, index) => {
      scratch.color.set(
        node.theme === "human"
          ? COORDINATION_HUMAN_COLOR
          : COORDINATION_AGENT_COLOR,
      );
      trails.current?.setColorAt(index, scratch.color);
      scratch.color.lerp(scratch.white, 0.55).multiplyScalar(1.6);
      shards.current?.setColorAt(index, scratch.color);
    });
    if (shards.current?.instanceColor)
      shards.current.instanceColor.needsUpdate = true;
    if (trails.current?.instanceColor)
      trails.current.instanceColor.needsUpdate = true;
  }, [nodes, scratch]);

  useUnitFrame((_, delta) => {
    const group = debris.current;
    if (!group || !emitter.current || !shards.current || !trails.current)
      return;
    const burst = burstSignal.current;
    if (burst.revision !== handledRevision.current) {
      handledRevision.current = burst.revision;
      // Turning diagnostics back on must not replay an old explosion.
      if (burst.age !== null && burst.age < 0.1) {
        age.current = burst.age;
        emitter.current.updateWorldMatrix(true, false);
        scratch.releaseWorld.copy(emitter.current.matrixWorld);
      }
    }
    if (age.current >= COORDINATION_FRAGMENT_DURATION) {
      group.visible = false;
      return;
    }
    age.current += Math.max(0, Math.min(delta, 0.1));
    group.visible = age.current < COORDINATION_FRAGMENT_DURATION;
    emitter.current.updateWorldMatrix(true, false);
    group.matrix
      .copy(emitter.current.matrixWorld)
      .invert()
      .multiply(scratch.releaseWorld);
    group.matrixWorldNeedsUpdate = true;
    const remaining = Math.max(
      0,
      1 - age.current / COORDINATION_FRAGMENT_DURATION,
    );
    if (shardMaterial.current)
      shardMaterial.current.opacity = remaining ** 0.65;
    if (trailMaterial.current)
      trailMaterial.current.opacity = remaining ** 1.6 * 0.65;

    nodes.forEach((node, index) => {
      const head = sampleCoordinationFragment(
        node,
        age.current,
        scratch.headSample,
      );
      const tail = sampleCoordinationFragment(
        node,
        Math.max(0, age.current - 0.028),
        scratch.tailSample,
      );
      scratch.position.set(head.x, head.y, head.z);
      scratch.tail.set(tail.x, tail.y, tail.z);
      scratch.direction.copy(scratch.position).sub(scratch.tail);
      const length = scratch.direction.length();
      scratch.direction.normalize();
      scratch.rotation.setFromUnitVectors(scratch.up, scratch.direction);
      const size = (0.004 + node.burstReach * 0.006) * head.scale;
      scratch.scale.set(size, size * 1.8, size);
      scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
      shards.current!.setMatrixAt(index, scratch.matrix);
      scratch.position.add(scratch.tail).multiplyScalar(0.5);
      scratch.scale.set(size * 0.28, length, size * 0.28);
      scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
      trails.current!.setMatrixAt(index, scratch.matrix);
    });
    shards.current.instanceMatrix.needsUpdate = true;
    trails.current.instanceMatrix.needsUpdate = true;
  }, "interactive");

  return (
    <group ref={emitter}>
      <group
        ref={debris}
        name="coordination-burst-fragments"
        matrixAutoUpdate={false}
        visible={false}
      >
        <instancedMesh
          ref={shards}
          args={[undefined, undefined, nodes.length]}
          frustumCulled={false}
          raycast={NO_RAYCAST}
          userData={{ physicsIgnore: true }}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            ref={shardMaterial}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </instancedMesh>
        <instancedMesh
          ref={trails}
          args={[undefined, undefined, nodes.length]}
          frustumCulled={false}
          raycast={NO_RAYCAST}
          userData={{ physicsIgnore: true }}
        >
          <coneGeometry args={[1, 1, 4]} />
          <meshBasicMaterial
            ref={trailMaterial}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </instancedMesh>
      </group>
    </group>
  );
}
