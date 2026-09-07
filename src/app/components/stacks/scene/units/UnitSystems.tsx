"use client";

// Systems pairs the operating manual and daily routine with six current-life
// images. The photographs keep their source aspect ratios and sit in two loose
// three-print ledges instead of becoming another rigid gallery grid.
import type { PhotoArtifactId } from "../../sceneArtifacts";
import FrozenBag, { type BagLabel } from "../FrozenBag";
import Grabbable from "../Grabbable";
import { ContactShade, FootPool } from "../GroundPool";
import HeldFacing from "../HeldFacing";
import MioBottle, { type MioFlavor } from "../MioBottle";
import ModelProp from "../ModelProp";
import PillBottle from "../PillBottle";
import PillOrganizer from "../PillOrganizer";
import SunLamp from "../SunLamp";
import { EggClock, EggTrigger, Pendulum, Sway } from "../eggs";
import {
  RoutineBoard,
  SODA_CAN_HEIGHT,
  SodaCan,
  reducedMotion,
  routineBoardSeat,
  usePropClick,
} from "../objects";
import { DeskFrame, deskFrameHeight } from "../photos";
import { BookRowMesh, ShelfUnit, packRow } from "../primitives";
import {
  PILL_BOTTLES,
  PILL_BOTTLE_MASS_KG,
  PILL_ORGANIZER_MASS_KG,
  PILL_ORGANIZER_ROW,
} from "../systemsPillLayout";
import { useUnitFrame } from "../unitActivity";
import { useUnitLod } from "../useUnitLod";
import React, { useMemo, useRef } from "react";
import type * as THREE from "three";

import { type UnitProps } from "./types";

const TILT_ROUTINE: [number, number, number] = [-0.13, 0.2, 0.015];
/**
 * The owner's 2026-08-29 turn toward the bay, about 31 degrees.
 *
 * It stays a separate OUTER rotation instead of folding into TILT_ROUTINE's y
 * because rotations do not commute: the layout editor turns the whole prop and
 * the tilt is applied inside it, so `Ry(yaw) . R(tilt)` is the transform that
 * was actually placed. A single Euler carrying both would lean the board a
 * different way. `routineBoardSeat` is still correct against the tilt alone —
 * a turn about the vertical axis cannot change how low the board hangs.
 */
const YAW_ROUTINE = -0.5405;
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
// 2026-08-22 — the frozen chicken bags said "daily food system" already —
// and came back on 2026-08-23, to the lower plank this time, standing over
// the two physical pill cases it shows. The lake print handed it that slot
// and waits in the artifact catalog exactly the way this one did.
//
// The three top-plank prints, the clock and the routine board were all placed
// by the owner in the free-roam layout editor on 2026-08-29. The numbers below
// are that session's, not a computed arrangement: the prints step forward and
// fan a little wider, and the home-office one squares up to the camera.
const TOP_PHOTOS: SystemPhotoSpec[] = [
  {
    id: "systems-working-session-v8",
    src: "/images/stacks/v8/systems-working-session.webp",
    aspect: 1024 / 536,
    width: 0.5,
    x: -0.2679,
    z: 0.1106,
    yaw: 0.1482,
  },
  {
    id: "systems-home-office-v8",
    src: "/images/stacks/v8/systems-home-office.webp",
    aspect: 4 / 3,
    width: 0.38,
    x: 0.2601,
    z: 0.0665,
    // Turned square to the bay. The editor left -0.0002 here, which is a
    // hundredth of a degree of drag noise around an intended zero.
    yaw: 0,
  },
  {
    id: "systems-sf-dusk-v8",
    src: "/images/stacks/v8/systems-sf-dusk.webp",
    aspect: 4 / 3,
    width: 0.38,
    x: 0.7346,
    z: 0.1179,
    yaw: -0.17,
  },
];

/** One frozen 3 lb bag, back against the plank beside the plant. There were
 * three in a shallow arc until 2026-08-28; one says "the daily food system"
 * as plainly as three did, and the two that went were most of what crowded
 * the left half of this plank. It keeps the arc's plant-side slot so the
 * food and the plant still read as one corner and the drinks still stand in
 * front of it. Kenney's bag is 0.41 × 0.6 × 0.22 in its own units; at this
 * scale it is ~0.26 wide × 0.38 tall × 0.14 deep world. The 0.20 yaw turns
 * the printed face toward the viewer without widening the footprint into the
 * plant. Set back to z -0.18 so the drinks have a clear 0.31 of plank in
 * front of it, which is what makes the two-row arrangement below fit.
 *
 * Moved again on 2026-08-30, in the owner's own free-roam pass over this
 * whole plank: 0.075 right and 0.072 back, which puts it behind the MiO
 * rather than beside them. Its rear face now overhangs the plank's back edge
 * by 0.043 — a soft pouch leaning off the open back of the shelf, measured
 * and left alone, because the back edge is the one nothing reads against. */
const BAG_SCALE = 0.63;
const BAG_MASS_KG = 1.361;
const CHICKEN_BAG = { x: -0.7798, z: -0.2523, yaw: 0.195 } as const;

/** The three supplement powders, all 1 kg, all the same Kenney bag wearing
 * their own baked labels. They stand in one row along the back of the plank
 * rather than with the frozen chicken: the bag over on the left is the food
 * system, these are the supplement stack and belong with the pill cases and
 * the bottles. A 1 kg pouch is squatter than a 3 lb bag of chicken, hence
 * the shorter scales.
 *
 * One depth, z -0.27, on the owner's call: lined up in the background. The
 * first pass stepped them apart in z, on his earlier "collagen closer, beta
 * alanine further" ordering, to stop three near-identical white pouches
 * reading as one wide object. Lined up, that job falls to size instead —
 * 0.48, 0.52, 0.56 left to right, ascending toward the corner they belong
 * to — with the yaws left unequal so the row is a row and not a parade.
 *
 * The plank runs z -0.38 at the back to 0.22 at the front. Their depths
 * differ, so at one z their rear faces land at -0.334, -0.345 and -0.355 and
 * the deepest still clears the back edge by 0.025, while their front faces
 * land within 0.021 of each other, and the front face is the line the eye
 * reads.
 *
 * THE OWNER'S PASS, 2026-08-30. He rearranged the whole lower plank in free
 * roam and asked for it written down. The row moved right as a group — beta
 * alanine 0.097, collagen 0.099, creatine 0.132 — and every pouch turned
 * closer to square, which is his call and not a correction: the yaws stay
 * unequal (0.053, 0.008, 0.087) so the row still reads as a row.
 *
 * The depths came back 0.2693, 0.2787 and 0.2871, which is 0.018 of spread on
 * a row whose whole instruction was "lined up in the background". That is
 * what a gizmo drag leaves, not a decision, so they sit at the mean instead —
 * see BAG_ROW_Z. Clearances off the scene afterwards: 0.055 and 0.083 between
 * neighbouring pouches, 0.096 from beta alanine to the chicken bag, and 0.016
 * from collagen to the notebook, which is the pair the notebook's own note is
 * about. *//** One depth for all three, still. The editor left them at -0.2693, -0.2787
 * and -0.2871; that 0.018 of spread is drag noise on a row whose whole
 * instruction was "lined up in the background", so they sit at the mean. */
const BAG_ROW_Z = -0.278;
const SUPPLEMENT_BAGS: Array<{
  /** Unique per pouch: both the hover key and the React key are built from
   * it. A shared hoverKey makes N props one prop, which this scene has been
   * caught by four times. */
  key: string;
  label: BagLabel;
  x: number;
  z: number;
  yaw: number;
  scale: number;
}> = [
  {
    key: "betaalanine",
    label: "betaAlanine",
    x: -0.4435,
    z: BAG_ROW_Z,
    yaw: 0.0529,
    scale: 0.48,
  },
  {
    key: "collagen",
    label: "collagen",
    x: -0.1714,
    z: BAG_ROW_Z,
    yaw: 0.008,
    scale: 0.52,
  },
  {
    key: "creatine",
    label: "creatine",
    x: 0.1519,
    z: BAG_ROW_Z,
    yaw: 0.087,
    scale: 0.56,
  },
];
const SUPPLEMENT_MASS_KG = 1;

/** The MiO bottles he goes through: two Hydrate (Berry Blast, 1.62 oz) and
 * one Lemonade (the 3.24 oz "2X" bottle), all three gathered in front of the
 * chicken bag (owner, 2026-08-28) instead of trailing off down the plank.
 * Six became three the same day: six read as a case bought that week, three
 * as the ones actually open.
 *
 * Two depth rows, not one line — the tall Lemonade set back between the two
 * Hydrates, which on 2026-08-30 the owner moved back to -0.107 with the pair
 * in front of it at -0.007 and -0.033. The bag is 0.28 wide and three bottles
 * abreast inside that need centres 0.08 apart, closer than any two of them
 * can stand at one depth; staggered, the pairs that overlap in x clear each
 * other by 0.03 instead. It is also how bottles land when you put them back.
 * Real masses: ~70 g and ~120 g full. The whole group went right and back in
 * the owner's 2026-08-30 pass, out from in front of the chicken bag and into
 * the gap the drinks left when they came forward. Centres are 0.102 and 0.132
 * apart now, wider than the 0.08 three abreast would need, so the stagger is
 * doing less work than it was. */
const MIO_ROW: Array<{
  flavor: MioFlavor;
  x: number;
  z: number;
  yaw: number;
  massKg: number;
}> = [
  { flavor: "hydrate", x: -0.8537, z: -0.0074, yaw: 0.45, massKg: 0.07 },
  { flavor: "lemonade", x: -0.7522, z: -0.107, yaw: -0.046, massKg: 0.12 },
  { flavor: "hydrate", x: -0.6204, z: -0.0334, yaw: -0.211, massKg: 0.07 },
];

// One print left on the lower plank, between the notebook and the lamp and
// set well back rather than at the lip. The lighthouse print that stood
// beside it went to the Musings shelf on 2026-08-23, next to the Gay Head
// souvenir it shows, and the Projects notebook took its place. Later the
// same day the lake print here gave way to the returning supplements print,
// so the photo stands directly behind the pill cases it pictures.
/** The notebook, moved out to the front of the plank and set down smaller.
 *
 * It used to sit square in the middle at x 0.05, z -0.08. At 0.373 x 0.513
 * against a plank only 0.60 deep it ran the whole depth of that column, so
 * five pill bottles and the creatine pouch all stood on it — which is what
 * "pill bottles and paper shouldn't be on top of each other" was about
 * (owner, 2026-08-28).
 *
 * There is exactly one band left on this plank once the powders are lined up
 * along the back and the bottles hold the middle: in front of the pouches'
 * front faces, between the drinks and the bottles, 0.415 deep and 0.58 wide.
 * The notebook at full size does not fit it in any pose. Turning it a
 * quarter does fit — 0.513 wide by 0.373 deep — and was tried first, but the
 * model is a stack of loose leaves with the board at one end, and side-on to
 * the camera the leaves stop reading as pages and start reading as decking.
 * So it keeps its own orientation and comes down small: 0.033 originally,
 * and 0.0359 since the owner scaled it up 8.9% on 2026-08-30, which renders
 * 0.39 x 0.46. The depth is the tight axis, so anything that moves the pouch
 * row or the bottles means re-measuring this — which is exactly what the
 * 8.9% did, and why the base below carries its own note. */
const NOTEBOOK_POSE = {
  // 0.02 left and 0.03 forward of where the editor left it. At 1.089x the pad
  // is 0.39 x 0.46 rendered, and at [-0.3386, 0.002] its back-right corner ran
  // 0.082 x 0.014 under the collagen pouch's base and 0.007 into the bottle in
  // front of it — paper under a standing pouch, which is the thing this prop
  // was shrunk and moved out here to stop. Measured off the scene afterwards:
  // 0.016 to collagen, 0.013 to that bottle, 0.058 to beta alanine, and 0.025
  // to the plank's own lip, which is the tight one.
  base: [-0.3586, 0, 0.032],
  rotation: [0, -0.1307, 0],
  scale: 0.0359,
} as const;
/** Where the light-therapy panel stands, and it is a tight corner.
 *
 * The panel's footprint is 0.361 x 0.299 measured off the scene, against the
 * 0.40 of plank left between the pill cases' right end (x 0.913) and the
 * plank's own edge (1.32). It fits because it is set BACK: at z -0.19 its
 * nearest approach to the front case pair is 0.024, to the back pair 0.040,
 * and to the print 0.056 — all positive, all measured as world-box separation,
 * which under-reports a yawed prop's real clearance. At the first placement
 * (x 1.10, z -0.13) the front case and the panel overlapped outright.
 *
 * The yaw turns the face toward the middle of the shelf, the way a therapy
 * lamp is angled at wherever you actually sit. -0.62 rather than the -0.34 it
 * was first placed at ("I'd turn the sunlamp to face the other content a bit
 * more", owner, 2026-08-29), which is now within a whisker of the desk lamp's
 * old -0.56. The turn is also what keeps the panel from eating the end of the
 * plank: square on it would be 0.32 wide before the stand, and every degree
 * trades width the plank is short of for depth it has spare. Because the cone
 * is aimed straight out of the face, turning the lamp turns its pool too — see
 * the spot's note in SunLamp. */
const SUN_LAMP = { x: 1.07, z: -0.19, yaw: -0.62 } as const;

/** The soda cans, over from Weightlifting on 2026-08-29. Two on the wood a
 * few millimetres apart with Sunkist resting on both of their rims, the top
 * can's base exactly one can height up: the pyramid moved intact, because its
 * arithmetic is measured off soda-can.glb and re-deriving it is how a stack
 * starts floating.
 *
 * WHERE, and it was not a free choice. A 0.288 x 0.148 footprint 0.46 tall
 * needs more clear plank than anything else on this shelf, so the seat was
 * swept rather than picked: every 1 cm position on the wood, the candidate's
 * footprint against every mounted prop's measured bounds, rejecting anything
 * that hangs off the plank. That returns two regions and only two. The
 * front-RIGHT corner (x 1.12 to 1.17) was tried first and rendered wrong —
 * it stands the pyramid directly in front of the sunlamp, 0.28 out from it,
 * and at this camera's shallow angle a 0.46 stack buries the 0.52 panel it
 * is standing in front of.
 *
 * So: the front-LEFT, which only appears once the sansevieria is measured as
 * its POT rather than as its leaf box. The room already draws that
 * distinction — `colliderProfile="foliage-base"` hands the solver the base
 * and nothing else — and a bounding box around a fan of leaves is mostly air.
 * The cans stand in front of the plant with the leaves rising behind them,
 * next to the MiO and the frozen chicken, which is the corner they belong to
 * by subject as well as by geometry: this end of the plank is the things he
 * drinks and eats, the other end is the things he takes.
 *
 * `hittable` did NOT come with it. The flag registers a prop with the golf
 * bay's strike registry under its unit index, and Systems has no bay: nothing
 * would ever read the registration, `tapHittableBall` would decline every
 * tap, and `isHittableBall` would go on answering true for a can that can
 * never be struck. It degrades safely rather than breaking, which is exactly
 * why it would have sat here unnoticed. The cans are still carried the way
 * every other movable on this plank is.
 *
 * THEN, 2026-08-29, a second pass: "I'd rather have the cans over a little
 * more left so it's not right in front of the plant" (owner). Left alone
 * cannot do it, and the measurement is worth writing down so nobody tries
 * again. The pyramid is 0.287 across, its left edge sat 0.017 off the plank's
 * own edge, and moving it the whole 0.017 takes the plant from 82% masked to
 * 78% — four screen pixels. The corner is 0.355 of usable plank between the
 * edge and the first MiO bottle; the plant's leaves are 0.352 wide and the
 * stack 0.287. They cannot stand side by side at any x.
 *
 * So the stack went LEFT by the 0.015 there was, and BEHIND: z 0.13 to -0.27.
 * THAT WAS UNDONE on 2026-08-30. The owner brought all three cans forward to
 * z 0.103 and right by about 0.07, and pushed the plant back to z -0.196 and
 * right to -1.161 in the same pass, so the pyramid stands in front of the
 * plant again with 0.30 of depth between them rather than being flush behind
 * it. The pyramid's screen rectangle covers 60% of the plant's — the same
 * fraction as the accepted arrangement below, but it is the hidden 60% now,
 * and the pot is behind the cans rather than drawing first. Reversing it is
 * one constant, SYSTEMS_CAN_Z.
 *
 * The pyramid's own arithmetic was restored rather than persisted. The editor
 * left the two base cans 0.172 apart against the 0.144 they are built at, so
 * they no longer touched and the can on top was balanced across a gap. Their
 * midpoint is the owner's; the separation and the centred top can are the
 * model's.
 * That is a judgement call and it is the one that actually answers him,
 * because the fix is depth order rather than x. In front of the plant the
 * cans masked 82% of it and hid the pot outright; behind it the plant draws
 * first and reads whole — pot, rim and full silhouette — with the stack
 * standing past its right shoulder. Two of the three cans read from the
 * camera and the Dr Pepper is mostly behind the leaves, which is the price
 * of the plant being whole.
 *
 * Measured after the move: 0.041 to the chicken bag at the tightest (the
 * world-box figure of 0.004 is the usual over-report on two yawed props),
 * 0.036 from the plank's back edge, 0.046 from the pot in z. The plant's leaf
 * box still overlaps the stack and still is not real: the leaves pass in
 * front of and above it now, which is the whole point. */
const SYSTEMS_CAN_PYRAMID = [
  { id: "diet-dr-pepper", x: -1.1727, y: 0, yaw: 0.18, shade: 0.18 },
  { id: "mtn-dew-zero", x: -1.0287, y: 0, yaw: -0.22, shade: 0.18 },
  // The shade is a sprite at the base; keep it narrower than the can so it
  // stays hidden inside the body rather than smudging the cans below.
  {
    id: "sunkist-zero",
    x: -1.1007,
    y: SODA_CAN_HEIGHT,
    yaw: 0.06,
    shade: 0.12,
  },
] as const;
const SYSTEMS_CAN_Z = 0.1033;

const LOWER_PHOTOS: SystemPhotoSpec[] = [
  {
    id: "systems-supplements-v8",
    src: "/images/stacks/v8/systems-supplements.webp",
    aspect: 1024 / 511,
    width: 0.44,
    x: 0.5806,
    // Right back against the plank's rear edge. The four real-size cases in
    // front of it are 0.45 long and need the depth: at the print's old
    // z -0.16 the back pair stood inside the frame.
    z: -0.3292,
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
              base={[-1.1614, 0, -0.1959]}
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
            {/* The daily food system and the supplement stack made physical:
                one frozen chicken bag beside the plant, three powder pouches
                along the back of the plank. Every one is its own movable
                prop with no Portal — there is nowhere honest for a bag of
                chicken or a pouch of creatine to go. The shade tracks the
                scale rather than restating it, so a resized pouch cannot
                keep the wrong footprint. */}
            <Grabbable
              unitIndex={index}
              hoverKey="grab:bag:realgood"
              base={[CHICKEN_BAG.x, 0, CHICKEN_BAG.z]}
              shadeColor={palette.shadow}
              shadeWidth={0.3}
              shape="box"
              massKg={BAG_MASS_KG}
            >
              <React.Suspense fallback={null}>
                <FrozenBag scale={BAG_SCALE} yaw={CHICKEN_BAG.yaw} />
              </React.Suspense>
            </Grabbable>
            {SUPPLEMENT_BAGS.map((bag) => (
              <Grabbable
                key={bag.key}
                unitIndex={index}
                hoverKey={`grab:bag:${bag.key}`}
                base={[bag.x, 0, bag.z]}
                shadeColor={palette.shadow}
                shadeWidth={bag.scale * 0.5}
                shape="box"
                massKg={SUPPLEMENT_MASS_KG}
              >
                <React.Suspense fallback={null}>
                  <FrozenBag
                    label={bag.label}
                    scale={bag.scale}
                    yaw={bag.yaw}
                  />
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
            {/* The notebook, over from Projects. A system is something you
                write down; it belongs beside the routine board more than it
                did beside the Mac. Its dark-theme tints are lighter than
                they were on Projects: there it sat in the desk lamp's spill
                beside a beige Mac, here it stands between near-white bags
                and a lit print, and the old slate read as a hole in the
                light ("why is the notebook so dark", 2026-08-23). */}
            <Grabbable
              unitIndex={index}
              hoverKey="grab:notebook:systems"
              base={[...NOTEBOOK_POSE.base]}
              shadeColor={palette.shadow}
              shadeWidth={0.42}
              shape="box"
              massKg={0.45}
            >
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/notebook.glb"
                  dark={dark}
                  variant="tinted"
                  tints={{
                    FFEB3B: dark ? "#8299b2" : "#71869e",
                    F44336: dark ? "#b08a63" : "#b68d62",
                    "795548": dark ? "#5b493e" : "#5b493e",
                  }}
                  rotation={[...NOTEBOOK_POSE.rotation]}
                  scale={NOTEBOOK_POSE.scale}
                />
              </React.Suspense>
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
            {/* The supplements photo made physical: the print's two seven-day
                cases stacked in front of it, and the supplement stack itself
                as fifteen bottles packed either side of the picture. Sizes,
                poses and the packing rule live in `systemsPillLayout`, which
                the unit suite checks for overlaps. Grabbable like the bags
                and with no Portal, for the same reason: there is nowhere
                honest for a pill case to go. */}
            {PILL_ORGANIZER_ROW.map((organizer) => (
              <Grabbable
                key={organizer.id}
                unitIndex={index}
                hoverKey={`grab:pills:organizer:${organizer.id}`}
                base={[organizer.x, organizer.y, organizer.z]}
                shadeColor={palette.shadow}
                shadeWidth={organizer.shade}
                shape="box"
                massKg={PILL_ORGANIZER_MASS_KG}
              >
                <PillOrganizer
                  variant={organizer.variant}
                  yaw={organizer.yaw}
                />
              </Grabbable>
            ))}
            {SYSTEMS_CAN_PYRAMID.map((can) => (
              <Grabbable
                key={can.id}
                unitIndex={index}
                hoverKey={`grab:can:${can.id}`}
                base={[can.x, can.y, SYSTEMS_CAN_Z]}
                shadeColor={palette.shadow}
                shadeWidth={can.shade}
                shape="box"
                massKg={0.36}
              >
                <SodaCan
                  dark={dark}
                  brand={can.id}
                  rotation={[0, can.yaw, 0]}
                />
              </Grabbable>
            ))}
            {PILL_BOTTLES.map((bottle) => (
              <Grabbable
                key={bottle.key}
                unitIndex={index}
                hoverKey={`grab:pills:bottle:${bottle.key}`}
                base={[bottle.x, bottle.y, bottle.z]}
                shadeColor={palette.shadow}
                shadeWidth={bottle.shade}
                shape="box"
                massKg={PILL_BOTTLE_MASS_KG[bottle.size]}
              >
                <PillBottle
                  tone={bottle.tone}
                  size={bottle.size}
                  cap={bottle.cap}
                  yaw={bottle.yaw}
                />
              </Grabbable>
            ))}
            {/* The practical at this end is the light-therapy panel he
                actually owns, not a desk lamp (owner, 2026-08-29). It keeps
                the desk lamp's hover key, so the Task Light stamp and the
                Systems insect Perch still find the same fixture. */}
            <group position={[SUN_LAMP.x, 0, SUN_LAMP.z]}>
              <SunLamp unitIndex={index} palette={palette} yaw={SUN_LAMP.yaw} />
              <ContactShade
                color={palette.shadow}
                width={0.34}
                position={[0, 0.02, -0.02]}
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
          base={[-0.6623, 0, 0.1977]}
          shadeColor={palette.shadow}
          shadeWidth={0.3}
          shape="box"
          massKg={0.45}
          // The carrier and the egg share this key on purpose (see above), so
          // the shared nod and the shiver were both firing off one pointer.
          signature="shiver"
        >
          {/* The owner's 2026-08-29 yaw. It wraps EggClock rather than the
              model inside it: the live dial is drawn at `facePosition` in
              EggClock's own space, so turning only the timber would leave the
              face pointing somewhere else. */}
          <group rotation={[0, 0.0775, 0]}>
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
          </group>
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
          base={[1.1383, routineBoardSeat(TILT_ROUTINE), 0.1965]}
          shadeColor={palette.shadow}
          shadeWidth={0.42}
          shape="box"
          massKg={0.45}
          tiltWhileHeld={false}
          to="routine"
        >
          <group rotation={[0, YAW_ROUTINE, 0]}>
            <group rotation={TILT_ROUTINE}>
              <RoutineBoard palette={palette} />
            </group>
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
