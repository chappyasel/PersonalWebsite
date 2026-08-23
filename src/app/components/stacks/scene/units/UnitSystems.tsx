"use client";

// Systems pairs the operating manual and daily routine with six current-life
// images. The photographs keep their source aspect ratios and sit in two loose
// three-print ledges instead of becoming another rigid gallery grid.
import type { PhotoArtifactId } from "../../sceneArtifacts";
import FrozenBag from "../FrozenBag";
import Grabbable from "../Grabbable";
import { ContactShade, FootPool } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import MioBottle, { type MioFlavor } from "../MioBottle";
import ModelProp from "../ModelProp";
import { EggClock, EggLamp, EggTrigger, Pendulum, Sway } from "../eggs";
import {
  RoutineBoard,
  reducedMotion,
  routineBoardSeat,
  usePropClick,
} from "../objects";
import { DeskFrame, deskFrameHeight } from "../photos";
import { BookRowMesh, ShelfUnit, packRow } from "../primitives";
import { useUnitFrame } from "../unitActivity";
import { useUnitLod } from "../useUnitLod";
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
  id: PhotoArtifactId;
  src: string;
  aspect: number;
  width: number;
  x: number;
  z: number;
  yaw: number;
};

// The supplements print (systems-supplements-v8) came off this shelf on
// 2026-08-22: the frozen chicken bags say "daily food system" already. Its
// slot now holds the lighthouse and home-office prints, up from the lower
// plank so the bags could stand next to the plant down there. The file and
// its artifact catalog entry are untouched, so it can come back any time.
const TOP_PHOTOS: SystemPhotoSpec[] = [
  {
    id: "systems-working-session-v8",
    src: "/images/stacks/v8/systems-working-session.webp",
    aspect: 1024 / 536,
    width: 0.5,
    x: -0.27,
    z: 0.09,
    yaw: 0.11,
  },
  {
    id: "systems-home-office-v8",
    src: "/images/stacks/v8/systems-home-office.webp",
    aspect: 4 / 3,
    width: 0.38,
    x: 0.2,
    z: 0.08,
    yaw: 0.16,
  },
  {
    id: "systems-sf-dusk-v8",
    src: "/images/stacks/v8/systems-sf-dusk.webp",
    aspect: 4 / 3,
    width: 0.38,
    x: 0.65,
    z: 0.13,
    yaw: -0.17,
  },
];

/** Three frozen 3 lb bags, each its own prop, in a shallow arc beside the
 * plant on the lower plank: the outer two turned ~16° inward and brought a
 * little forward, the middle one square and a little back, so the three
 * face a point just in front of the shelf. Kenney's bag is 0.41 × 0.6 × 0.22
 * in its own units; at this scale each is ~0.26 wide × 0.38 tall × 0.14
 * deep world. Spaced so the yawed boxes still clear each other by ~2 cm (a
 * fan that intersects reads as one object from any angle). */
const BAG_SCALE = 0.63;
const BAG_MASS_KG = 1.361;
// Toward the back of the plank (the prints sit at z ≈ 0.13), so they stand
// in the plank's shadow like stock on a shelf rather than out front.
const BAG_ROW: Array<{ x: number; z: number; yaw: number }> = [
  { x: -0.92, z: -0.1, yaw: 0.28 },
  { x: -0.62, z: -0.16, yaw: 0 },
  { x: -0.32, z: -0.1, yaw: -0.28 },
];

/** The MiO bottles he goes through: four Hydrate (Berry Blast, 1.62 oz) and
 * two Lemonade (the 3.24 oz "2X" bottle), in front of the bags the way they
 * land when you put them down — flavours mixed, gaps uneven, some forward
 * and some back, each turned its own way. Nothing in a line. Real masses:
 * ~70 g and ~120 g full. Centres stay ≥ 0.11 apart in x so no two
 * bottles (max width 0.09) touch. */
const MIO_ROW: Array<{
  flavor: MioFlavor;
  x: number;
  z: number;
  yaw: number;
  massKg: number;
}> = [
  { flavor: "hydrate", x: -0.98, z: 0.09, yaw: 0.45, massKg: 0.07 },
  { flavor: "hydrate", x: -0.87, z: 0.02, yaw: -0.3, massKg: 0.07 },
  { flavor: "lemonade", x: -0.73, z: 0.1, yaw: 0.6, massKg: 0.12 },
  { flavor: "hydrate", x: -0.62, z: 0.04, yaw: -0.55, massKg: 0.07 },
  { flavor: "hydrate", x: -0.5, z: 0.11, yaw: 0.2, massKg: 0.07 },
  { flavor: "lemonade", x: -0.36, z: 0.03, yaw: -0.4, massKg: 0.12 },
];

// Two prints left on the lower plank, spread between the bottles and the
// lamp and set well back (level with the bags) rather than at the lip.
const LOWER_PHOTOS: SystemPhotoSpec[] = [
  {
    id: "systems-lighthouse-v8",
    src: "/images/stacks/v8/systems-lighthouse.webp",
    aspect: 819 / 1024,
    width: 0.27,
    x: 0.12,
    z: -0.08,
    yaw: -0.2,
  },
  {
    id: "systems-lake-v8",
    src: "/images/stacks/v8/systems-lake.webp",
    aspect: 4 / 3,
    width: 0.38,
    x: 0.58,
    z: -0.1,
    yaw: 0.1,
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
  const { id } = photo;
  const height = photo.width / photo.aspect;
  const hoverKey = `grab:photo:${id}`;
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={[photo.x, 0, photo.z]}
      shadeColor={palette.shadow}
      shadeWidth={Math.max(0.3, photo.width * 1.15)}
      shape="box"
      massKg={0.45}
      artifact={id}
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
  useUnitFrame((_, delta) => {
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
              colliderProfile="foliage-base"
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
            {/* The daily food system made physical: three frozen chicken
                bags in a shallow arc beside the plant. Each is its own
                movable prop with no Door — there is nowhere honest for a bag
                of chicken to go. */}
            {BAG_ROW.map((bag, i) => (
              <Grabbable
                key={i}
                unitIndex={index}
                hoverKey={`grab:bag:realgood:${i}`}
                base={[bag.x, 0, bag.z]}
                shadeColor={palette.shadow}
                shadeWidth={0.3}
                shape="box"
                massKg={BAG_MASS_KG}
              >
                <React.Suspense fallback={null}>
                  <FrozenBag scale={BAG_SCALE} yaw={bag.yaw} />
                </React.Suspense>
              </Grabbable>
            ))}
            {MIO_ROW.map((bottle, i) => (
              <Grabbable
                key={`${bottle.flavor}-${i}`}
                unitIndex={index}
                hoverKey={`grab:mio:${bottle.flavor}:${i}`}
                base={[bottle.x, 0, bottle.z]}
                shadeColor={palette.shadow}
                shadeWidth={bottle.flavor === "lemonade" ? 0.13 : 0.11}
                shape="box"
                massKg={bottle.massKg}
              >
                <React.Suspense fallback={null}>
                  <MioBottle flavor={bottle.flavor} yaw={bottle.yaw} />
                </React.Suspense>
              </Grabbable>
            ))}
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
          // The carrier and the egg share this key on purpose (see above), so
          // the shared nod and the shiver were both firing off one pointer.
          signature="shiver"
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
          base={[1.08, routineBoardSeat(TILT_ROUTINE), -0.02]}
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
