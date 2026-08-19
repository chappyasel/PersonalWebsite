"use client";

// Systems pairs the operating manual and daily routine with six current-life
// images. The photographs keep their source aspect ratios and sit in two loose
// three-print ledges instead of becoming another rigid gallery grid.
import Grabbable from "../Grabbable";
import { ContactShade, FootPool } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import ModelProp from "../ModelProp";
import { EggClock, EggLamp, EggTrigger, Pendulum, Sway } from "../eggs";
import {
  RoutineBoard,
  reducedMotion,
  routineBoardSeat,
  usePropClick,
} from "../objects";
import {
  DeskFrame,
  PHOTO_LINKS,
  deskFrameHeight,
  photoDoorLabel,
} from "../photos";
import { BookRowMesh, ShelfUnit, packRow } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { useFrame } from "@react-three/fiber";
import React, { useMemo, useRef } from "react";
import type * as THREE from "three";

import { type UnitProps } from "./types";

const TILT_ROUTINE: [number, number, number] = [-0.13, 0.2, 0.015];
const CLOCK_S = 1.8;
const NUDGE_PEAK = 0.018;
const NUDGE_DECAY = 2.4;
const NUDGE_RATE = 5.2;
const NUDGE_END = 2;
const NUDGE_TOP = Math.atan(NUDGE_RATE / NUDGE_DECAY) / NUDGE_RATE;
const NUDGE_AMP =
  NUDGE_PEAK /
  (Math.exp(-NUDGE_DECAY * NUDGE_TOP) * Math.sin(NUDGE_RATE * NUDGE_TOP));

/** Named so pointer tests can read the case motion from the scene graph. */
export const CLOCK_CASE_NODE = "stacks-clock-case";

type SystemPhotoSpec = {
  id: string;
  src: string;
  aspect: number;
  width: number;
  x: number;
  z: number;
  yaw: number;
};

const TOP_PHOTOS: SystemPhotoSpec[] = [
  {
    id: "systems-working-session-v8",
    src: "/images/stacks/v8/systems-working-session.webp",
    aspect: 1024 / 536,
    width: 0.5,
    x: -0.22,
    z: 0.09,
    yaw: 0.11,
  },
  {
    id: "systems-supplements-v8",
    src: "/images/stacks/v8/systems-supplements.webp",
    aspect: 1024 / 511,
    width: 0.49,
    x: 0.36,
    z: 0.14,
    yaw: -0.11,
  },
];

const LOWER_PHOTOS: SystemPhotoSpec[] = [
  {
    id: "systems-sf-dusk-v8",
    src: "/images/stacks/v8/systems-sf-dusk.webp",
    aspect: 4 / 3,
    width: 0.38,
    x: -0.64,
    z: 0.13,
    yaw: -0.17,
  },
  {
    id: "systems-lake-v8",
    src: "/images/stacks/v8/systems-lake.webp",
    aspect: 4 / 3,
    width: 0.38,
    x: -0.19,
    z: 0.13,
    yaw: 0.1,
  },
  {
    id: "systems-lighthouse-v8",
    src: "/images/stacks/v8/systems-lighthouse.webp",
    aspect: 819 / 1024,
    width: 0.27,
    x: 0.22,
    z: 0.14,
    yaw: -0.2,
  },
  {
    id: "systems-home-office-v8",
    src: "/images/stacks/v8/systems-home-office.webp",
    aspect: 4 / 3,
    width: 0.38,
    x: 0.6,
    z: 0.08,
    yaw: 0.16,
  },
];

function SystemPhoto({
  photo,
  unitIndex,
  palette,
  textured,
}: {
  photo: SystemPhotoSpec;
  unitIndex: number;
  palette: UnitProps["palette"];
  textured: boolean;
}) {
  const height = photo.width / photo.aspect;
  const hoverKey = `grab:photo:${photo.id}`;
  const href = PHOTO_LINKS[photo.id] ?? null;
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={[photo.x, 0, photo.z]}
      shadeColor={palette.shadow}
      shadeWidth={Math.max(0.3, photo.width * 1.15)}
      shape="box"
      massKg={0.45}
      href={href ?? undefined}
      doorLabel={href ? photoDoorLabel(href) : undefined}
    >
      <HeldFacing
        hoverKey={hoverKey}
        position={[0, deskFrameHeight(height) / 2, 0]}
        rest={[0, photo.yaw, 0]}
      >
        <DeskFrame
          src={photo.src}
          palette={palette}
          textured={textured}
          width={photo.width}
          height={height}
        />
      </HeldFacing>
    </Grabbable>
  );
}

/** The face and case retain separate click behaviors, but both now live under
 * the same rocking transform. Previously the canvas face was EggClock's
 * sibling of the rock group, so the timber moved while the live dial floated. */
function FloorClock({ unitIndex, dark }: { unitIndex: number; dark: boolean }) {
  const rock = useRef<THREE.Group>(null);
  const t = useRef(-1);
  const shove = () => {
    if (reducedMotion()) return;
    t.current = 0;
  };

  usePropClick(unitIndex, "egg:clock:case", shove);
  usePropClick(unitIndex, "egg:clock:floor", shove);
  useFrame((_, delta) => {
    const group = rock.current;
    if (!group || t.current < 0) return;
    t.current += Math.min(delta, 1 / 30);
    if (t.current > NUDGE_END) {
      group.rotation.z = 0;
      t.current = -1;
      return;
    }
    group.rotation.z =
      NUDGE_AMP *
      Math.exp(-NUDGE_DECAY * t.current) *
      Math.sin(NUDGE_RATE * t.current);
  });

  return (
    <group ref={rock} name={CLOCK_CASE_NODE}>
      <EggClock
        unitIndex={unitIndex}
        hoverKey="egg:clock:floor"
        facePosition={[0, 1.15 * CLOCK_S, 0.0736 * CLOCK_S]}
        faceRadius={0.071 * CLOCK_S}
        faceStyle="grandfather"
      >
        <EggTrigger
          unitIndex={unitIndex}
          hoverKey="egg:clock:case"
          onTrigger={shove}
        >
          <Pendulum unitIndex={unitIndex}>
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/grandfather-clock.glb"
                dark={dark}
                scale={CLOCK_S}
              />
            </React.Suspense>
          </Pendulum>
        </EggTrigger>
      </EggClock>
    </group>
  );
}

export default function UnitSystems({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
  const manualRow = useMemo(() => packRow(0.58, [], palette, 68), [palette]);

  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <Grabbable
              unitIndex={index}
              hoverKey="grab:plant:sansevieria"
              base={[-1.22, 0, -0.08]}
              shadeColor={palette.shadow}
              shadeWidth={0.36}
              shape="box"
              massKg={2.4}
            >
              <Sway unitIndex={index} amount={0.016} rate={0.31} phase={2.2}>
                <React.Suspense fallback={null}>
                  <ModelProp
                    url="/models/sansevieria.glb"
                    dark={dark}
                    variant="recolor"
                    rotation={[0, 0.4, 0]}
                    scale={0.18}
                  />
                </React.Suspense>
                <mesh position={[0, 0.099, 0]}>
                  <cylinderGeometry args={[0.07, 0.07, 0.0135, 20]} />
                  <meshStandardMaterial color="#3a2b1c" roughness={1} />
                </mesh>
              </Sway>
            </Grabbable>
            {LOWER_PHOTOS.map((photo) => (
              <SystemPhoto
                key={photo.id}
                photo={photo}
                unitIndex={index}
                palette={palette}
                textured={textured}
              />
            ))}
            <group position={[1.08, 0, -0.04]}>
              <EggLamp
                unitIndex={index}
                palette={palette}
                dark={dark}
                yaw={-0.56}
                scale={1.52}
                aimOffset={[-0.42, 0.02, 0.04]}
                spillScale={0.75}
              />
              <ContactShade
                color={palette.shadow}
                width={0.34}
                position={[0, 0.02, 0.03]}
              />
            </group>
          </group>
        }
      >
        <group position={[-1.14, 0, -0.08]}>
          <BookRowMesh
            items={manualRow}
            palette={palette}
            salt={68}
            linkUnit={index}
            to="manual"
            grabbableVolumes
          />
        </group>

        {/* The clock's egg and the carrier deliberately share one hover key:
            a stationary press still winds the face to 3:45, while crossing
            the grab threshold suppresses that click and carries the clock. */}
        <Grabbable
          unitIndex={index}
          hoverKey="egg:clock:alarm"
          base={[-0.66, 0, 0.25]}
          shadeColor={palette.shadow}
          shadeWidth={0.3}
          shape="box"
          massKg={0.45}
        >
          <EggClock
            unitIndex={index}
            hoverKey="egg:clock:alarm"
            facePosition={[0, 0.1159, 0.0354]}
            faceRadius={0.0816}
          >
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/alarm-clock.glb"
                dark={dark}
                scale={1.4}
              />
            </React.Suspense>
          </EggClock>
        </Grabbable>

        {TOP_PHOTOS.map((photo) => (
          <SystemPhoto
            key={photo.id}
            photo={photo}
            unitIndex={index}
            palette={palette}
            textured={textured}
          />
        ))}

        <Grabbable
          unitIndex={index}
          hoverKey="link:routineboard"
          base={[0.98, routineBoardSeat(TILT_ROUTINE), -0.02]}
          shadeColor={palette.shadow}
          shadeWidth={0.42}
          shape="box"
          massKg={0.45}
          tiltWhileHeld={false}
          to="routine"
        >
          <group rotation={TILT_ROUTINE}>
            <RoutineBoard palette={palette} />
          </group>
        </Grabbable>
      </ShelfUnit>

      {/* Shared floor fixture on the outgoing Systems/Projects seam. Mirror
          the old incoming placement so its face turns back into both bays. */}
      <group position={[1.98, -1.115, -0.15]} rotation={[0, -0.15, 0]}>
        <FloorClock unitIndex={index} dark={dark} />
      </group>
      <FootPool
        color={palette.shadow}
        size={[0.66, 0.44]}
        position={[1.98, -1.115, -0.1]}
      />
    </group>
  );
}
