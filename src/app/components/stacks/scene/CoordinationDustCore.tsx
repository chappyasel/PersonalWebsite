"use client";

import { isWorldRevealed } from "../boot/worldBootSession";
import { useStacks } from "../store";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  COORDINATION_BLINKER_NAME,
  COORDINATION_DUST_NAME,
  CROSSING_TOKENS,
  coordinationBlinker,
  coordinationCrossing,
  crossingOrbLight,
} from "./coordinationCrossing";
import { CROSSING_WIRE_IGNORE } from "./coordinationCrossingWire";
import {
  BLINKER_EM,
  BLINKER_LOCAL_PER_EM,
  COORDINATION_DUST_COLORS,
  DUST_LOCAL_PER_PX,
  DUST_REST_SPIN,
  blowCoordinationDust,
  createCoordinationDust,
  kickCoordinationDust,
  moveCoordinationDustHand,
  settleCoordinationDust,
  stepCoordinationDust,
} from "./coordinationDust";
import {
  BLINKER_FRAGMENT,
  BLINKER_VERTEX,
  DUST_FRAGMENT,
  DUST_VERTEX,
} from "./coordinationDustShader";
import {
  COORDINATION_GLOBE_INTERACTION_ID,
  type CoordinationBurst,
  stepCoordinationBurst,
} from "./coordinationNetwork";
import { sceneUnitLightUserData } from "./sceneGpuPrewarm";
import { useUnitRealLights } from "./scenePerformance";
import { useUnitFrame } from "./unitActivity";
import {
  type CoordinationChargeSignal,
  coordinationChargeProgress,
} from "./useCoordinationCharge";

const NO_RAYCAST = () => null;
/** One page pixel is a small fraction of a room unit, so distances moved count
 * for far less than the page's scroll does, or the dust would leave the plinth. */
const CARRY_WIND = 0.25;
const ROOM_WIND = 0.1;
const ROOM_ONLY = { physicsIgnore: true, [CROSSING_WIRE_IGNORE]: true };

const BLOCK_MIN = new THREE.Vector2(
  -BLINKER_EM.width / 2,
  -BLINKER_EM.height / 2,
);
const BLOCK_MAX = new THREE.Vector2(
  BLINKER_EM.width / 2,
  BLINKER_EM.height / 2,
);
/** Far enough that the widest shadow, 1.5em of blur, is gone at the quad's edge.
 * The geometry is this size in the room, so a bounds or override pass that
 * skips the billboard shader still finds something the size of the glow. */
const QUAD_LOCAL = 16 * BLINKER_LOCAL_PER_EM;
/** Where the composer's tone curve lands on the page's orange: about
 * [250, 105, 14] on screen against the page's [245, 115, 47]. At 1.5 it reads
 * pale yellow. */
const BLOCK_HEAT = 0.5;
/** A shade over the page's glow, which the room's tone curve dims. */
const GLOW_GAIN = 1.4;
const LIGHT_REACH = 2.4;
const LIGHT_INTENSITY = { day: 1.1, night: 0.7 };

const linear = ([r, g, b]: readonly [number, number, number]) =>
  new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);

/** Dust around coordination.sh's blinker, inside the orb's black sphere, and
 * the blinker is a real light. The sphere has to stay: it is the page's dark
 * ground, and its depth keeps these pixels sharp, because anything without
 * depth of its own takes DoF's blur from the meadow behind it and vanishes.
 * Everything here hangs off the frame loop's refs, so a blink never renders
 * React. The light stays mounted while the unit is far away: it counts toward
 * the room's light shape, which must not change as the visitor travels. */
export function CoordinationDustCore({
  unitIndex,
  visible,
  dark,
  still,
  burstSignal,
  chargeSignal,
  horizonMaterial,
  insideHorizon,
}: {
  unitIndex: number;
  visible: boolean;
  dark: boolean;
  still: boolean;
  burstSignal: { current: CoordinationBurst };
  chargeSignal: CoordinationChargeSignal;
  horizonMaterial: RefObject<THREE.ShaderMaterial | null>;
  /** Stencil state that clips a material to the sphere's dithered silhouette. */
  insideHorizon: Readonly<THREE.MaterialParameters>;
}) {
  const engaged = useStacks(
    (state) =>
      state.focusedInteraction === COORDINATION_GLOBE_INTERACTION_ID ||
      state.hovered === COORDINATION_GLOBE_INTERACTION_ID ||
      state.dragging === COORDINATION_GLOBE_INTERACTION_ID,
  );
  const realLights = useUnitRealLights(unitIndex);

  const root = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);

  const accent = useMemo(() => linear(CROSSING_TOKENS.dark.accent), []);
  const dustMaterial = useRef<THREE.ShaderMaterial>(null);
  const blinkerMaterial = useRef<THREE.ShaderMaterial>(null);

  // Starting values only. r3f copies each uniform onto the material instead of
  // keeping these objects, so every per-frame write has to go through the
  // material. A write here changes nothing on screen.
  const blinkerUniforms = useMemo(
    () => ({
      uBlockMin: { value: BLOCK_MIN },
      uBlockMax: { value: BLOCK_MAX },
      uEm: { value: 1 },
      uLocalPerEm: { value: BLINKER_LOCAL_PER_EM },
      uAccent: { value: accent },
      uBlock: { value: 1 },
      uBloom: { value: 0.74 * GLOW_GAIN },
      uHeat: { value: BLOCK_HEAT },
    }),
    [accent],
  );

  const dust = useMemo(() => {
    const created = createCoordinationDust();
    if (still) settleCoordinationDust(created);
    return created;
  }, [still]);
  const dustGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const dynamic = (array: Float32Array, size: number) =>
      new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", dynamic(dust.position, 3));
    geometry.setAttribute("aAlpha", dynamic(dust.alpha, 1));
    geometry.setAttribute("aKind", new THREE.BufferAttribute(dust.kind, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(dust.size, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(dust.phase, 1));
    return geometry;
  }, [dust]);
  useEffect(() => () => dustGeometry.dispose(), [dustGeometry]);
  const dustUniforms = useMemo(
    () => ({
      uColors: { value: COORDINATION_DUST_COLORS.map(linear) },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uBoost: { value: 1 },
    }),
    [],
  );

  const scratch = useMemo(
    () => ({
      world: new THREE.Vector3(),
      lastWorld: null as THREE.Vector3 | null,
      lastCamera: null as THREE.Vector3 | null,
      forward: new THREE.Vector3(),
      ray: new THREE.Vector3(),
      probe: new THREE.Vector3(),
      activity: 0,
      lift: 0,
      seenBurst: burstSignal.current.revision,
    }),
    // One scratch for the component's life: the revision only seeds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useUnitFrame(({ camera, gl, pointer }, delta) => {
    const group = root.current;
    const grains = dustMaterial.current?.uniforms;
    const block = blinkerMaterial.current?.uniforms;
    if (!grains || !block) return;
    const now = performance.now();
    grains.uPixelRatio!.value = gl.getPixelRatio();
    const run = coordinationCrossing.getSnapshot().run;
    const orbLight = run ? crossingOrbLight(now - run.startedAt) : 1;
    const blinker = still
      ? { block: 1, bloom: 0.74 }
      : coordinationBlinker(now);

    if (group && visible && !still && isWorldRevealed()) {
      const dt = Math.max(0, Math.min(delta, 0.1));
      scratch.activity = THREE.MathUtils.damp(
        scratch.activity,
        engaged ? 1 : 0,
        4.2,
        dt,
      );
      const burstStrength = stepCoordinationBurst(burstSignal.current, dt);
      const charge = coordinationChargeProgress(chargeSignal.current, now);
      if (burstSignal.current.revision !== scratch.seenBurst) {
        scratch.seenBurst = burstSignal.current.revision;
        kickCoordinationDust(dust, 420);
      }

      // The room moving past the dust, or the dust carried through the room,
      // is wind. A prop that has only just woken up has not really moved.
      group.getWorldPosition(scratch.world);
      if (scratch.lastWorld && scratch.lastCamera) {
        scratch.probe
          .copy(scratch.world)
          .sub(
            scratch.ray
              .copy(scratch.world)
              .sub(scratch.lastWorld)
              .multiplyScalar(CARRY_WIND),
          )
          .sub(
            scratch.ray
              .copy(camera.position)
              .sub(scratch.lastCamera)
              .multiplyScalar(ROOM_WIND),
          );
        group.worldToLocal(scratch.probe);
        blowCoordinationDust(
          dust,
          scratch.probe.x / DUST_LOCAL_PER_PX,
          scratch.probe.y / DUST_LOCAL_PER_PX,
          scratch.probe.z / DUST_LOCAL_PER_PX,
        );
      }
      (scratch.lastWorld ??= new THREE.Vector3()).copy(scratch.world);
      (scratch.lastCamera ??= new THREE.Vector3()).copy(camera.position);

      // The pointer, on the plane through the cloud that faces the camera.
      camera.getWorldDirection(scratch.forward);
      scratch.ray
        .set(pointer.x, pointer.y, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize();
      const along =
        scratch.probe
          .copy(scratch.world)
          .sub(camera.position)
          .dot(scratch.forward) /
        Math.max(0.001, scratch.ray.dot(scratch.forward));
      scratch.probe.copy(camera.position).addScaledVector(scratch.ray, along);
      group.worldToLocal(scratch.probe);
      moveCoordinationDustHand(
        dust,
        scratch.probe.x / DUST_LOCAL_PER_PX,
        scratch.probe.y / DUST_LOCAL_PER_PX,
        scratch.probe.z / DUST_LOCAL_PER_PX,
      );

      stepCoordinationDust(dust, dt, {
        spin: DUST_REST_SPIN + 0.5 * charge,
        gather: 1 - 0.24 * charge,
      });
      const horizon = horizonMaterial.current?.uniforms;
      if (horizon) {
        horizon.uTime!.value = now / 1000;
        horizon.uActivity!.value = scratch.activity;
      }
      dustGeometry.attributes.position!.needsUpdate = true;
      dustGeometry.attributes.aAlpha!.needsUpdate = true;
      grains.uTime!.value = now / 1000;
      scratch.lift = 0.35 * scratch.activity + 1.2 * charge + 2 * burstStrength;
      grains.uBoost!.value = 1 + scratch.lift;
    }

    // Once a crossing runs, its pass draws this blinker and these grains, so
    // they can leave the orb and survive the room fading around them.
    const lift = 1 + scratch.lift;
    if (run) grains.uBoost!.value = 0;
    block.uBlock!.value = run ? 0 : blinker.block;
    block.uBloom!.value = run ? 0 : blinker.bloom * lift * GLOW_GAIN;
    if (light.current) {
      // A floor under the block's blink, so the shelf breathes, not strobes.
      light.current.intensity =
        (dark ? LIGHT_INTENSITY.night : LIGHT_INTENSITY.day) *
        (0.45 + 0.55 * blinker.bloom) *
        lift *
        orbLight;
    }
  });

  return (
    <group ref={root}>
      <group visible={visible}>
        <points
          name={COORDINATION_DUST_NAME}
          geometry={dustGeometry}
          scale={DUST_LOCAL_PER_PX}
          frustumCulled={false}
          raycast={NO_RAYCAST}
          renderOrder={8}
          userData={ROOM_ONLY}
        >
          <shaderMaterial
            {...insideHorizon}
            ref={dustMaterial}
            uniforms={dustUniforms}
            vertexShader={DUST_VERTEX}
            fragmentShader={DUST_FRAGMENT}
            transparent
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
        <mesh
          name={COORDINATION_BLINKER_NAME}
          raycast={NO_RAYCAST}
          renderOrder={9}
          userData={ROOM_ONLY}
        >
          <planeGeometry args={[QUAD_LOCAL, QUAD_LOCAL]} />
          <shaderMaterial
            ref={blinkerMaterial}
            uniforms={blinkerUniforms}
            vertexShader={BLINKER_VERTEX}
            fragmentShader={BLINKER_FRAGMENT}
            transparent
            premultipliedAlpha
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      <pointLight
        ref={light}
        visible={realLights}
        userData={sceneUnitLightUserData(unitIndex)}
        color={accent}
        intensity={0}
        distance={LIGHT_REACH}
        decay={2}
      />
    </group>
  );
}
