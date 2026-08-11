"use client";

// Systems — CT Books as the operating manual, the alarm clock (live canvas
// face over the GLB dial), and the daily checklist on a clipboard; book pile
// + sansevieria below; the grandfather clock stands on the floor at the
// unit's left flank, ticking the same live time with its own rod and bob
// swinging inside the case. The 3:45 wake-up story lives in the click easter
// egg (EggClock).
import React, { useMemo, useRef } from "react";

import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";

import { EggClock, EggTrigger, Pendulum, Sway } from "../eggs";
import { ContactShade, FootPool } from "../GroundPool";
import PropLink, { HoverProp } from "../links";
import ModelProp from "../ModelProp";
import {
  Polaroid,
  polaroidSeat,
  reducedMotion,
  RoutineBoard,
  routineBoardSeat,
  usePropClick,
} from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import { BookPile, BookRowMesh, packRow, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

/** Rest tilts for this unit's two leaning prints. Named because each is used
 * twice — to pose the print, and to derive the height at which that pose lands
 * on the plank. They were mounted at a bare 0.1425, which was `oldHeight/2 ·
 * cos(lean)` for a Polaroid that has not been 0.24 wide since it was pinned to
 * the house scale, leaving both prints 1.5 cm off the wood. */
const TILT_REDWOODS: [number, number, number] = [-0.16, -0.2, 0.05];
const TILT_SUNRISE: [number, number, number] = [-0.15, -0.16, 0.03];
/** The clipboard's rest tilt, declared once and fed to BOTH the mount and
 * `routineBoardSeat`, so the pose and the height it stands at cannot drift
 * apart. That drift is the bug this scene has regrown five times. */
const TILT_ROUTINE: [number, number, number] = [-0.13, 0.2, 0.015];

/**
 * The longcase clock, at the room's real scale — see the placement note below.
 *
 * 1.37 → 1.80. `1.3641 × 1.80 = 2.455` world units tall, which at the room's
 * 2.00 units per metre is a 1.23 m clock. It is NOT the 1.95 m a longcase
 * clock actually stands: the frame does not hold one. Measured off a rendered
 * frame rather than off the projection maths — the plank at y 0.035 lands at
 * py 425 and the floor at py 745, so this camera holds 278 px per world unit
 * here and the top of the window is world y 1.564. The metric scale (2.859)
 * would put the whole hood, and a third of the case, above it; 1.90 left only
 * 24 px of sky over the hood, which the pointer parallax alone can eat. 1.80
 * keeps 62 px at rest and still clears at every pointer position.
 *
 * Every dial constant is registered to the scale and moves with it — the model
 * carries its dial at local (0, 1.150, 0.0728) with r 0.0676, so × 1.80 is
 * (0, 2.070, 0.1310) r 0.1217. The face lands at world y 0.955, comfortably
 * inside the frame and still a click target.
 */
const CLOCK_S = 1.8;

/** Peak lean of the nudge, and how fast it dies. A 2.46-unit case leaning
 * 0.018 rad swings its hood 4.4 cm, which reads clearly at this camera, and
 * drops the far bottom corner 0.006 into the floor for under a second — the
 * price of rocking about the base centre rather than an edge, paid only while
 * the shove is in flight. The REST pose, which is what
 * scripts/stacks-floaters.mjs measures, is untouched. */
const NUDGE_PEAK = 0.018;
const NUDGE_DECAY = 2.4;
const NUDGE_RATE = 5.2;
const NUDGE_END = 2.0;
/** Where the first arc tops out: the product e^(−λt)·sin(ωt) peaks where its
 * derivative vanishes, at atan(ω/λ)/ω — a third of a period EARLIER than
 * |sin| alone. Normalising against π/2ω instead is what shipped the golf
 * club's swing 20% over its stated amplitude. */
const NUDGE_TOP = Math.atan(NUDGE_RATE / NUDGE_DECAY) / NUDGE_RATE;
const NUDGE_AMP =
  NUDGE_PEAK /
  (Math.exp(-NUDGE_DECAY * NUDGE_TOP) * Math.sin(NUDGE_RATE * NUDGE_TOP));

/** Named so the harness can read the shove off the scene graph rather than
 * off pixels — the camera's idle bob makes every region of the frame "move". */
export const CLOCK_CASE_NODE = "stacks-clock-case";

/**
 * The case and the face now answer differently (owner: "can you make clicking
 * the clock tower do something different from clicking the clock face").
 *
 * - The FACE winds the hands round to 3:45, holds, and winds on to the
 *   visitor's live time. That is EggClock's egg and it belongs to the dial.
 * - The CASE takes a shove: the whole clock rocks on its plinth once and
 *   settles, the way a two-metre box of wood answers a hand. Same idiom as the
 *   step ladder on Books, which slides when you push it.
 *
 * The split is structural rather than positional. `EggClock` puts its own
 * handler on a group that contains BOTH the model and the dial, so an inner
 * `EggTrigger` around the model alone claims any hit on the case and calls
 * `stopPropagation`, which is what keeps the wind from also firing. A hit on
 * the dial has no inner handler to stop it and reaches EggClock. Two hover
 * keys, so the cursor and the window-level click below can tell them apart.
 */
function FloorClock({
  unitIndex,
  dark,
}: {
  unitIndex: number;
  dark: boolean;
}) {
  const rock = useRef<THREE.Group>(null);
  /** Seconds since the shove; negative means at rest and nothing is written. */
  const t = useRef(-1);
  const shove = () => {
    if (reducedMotion()) return;
    t.current = 0;
  };
  // Both paths, for the reason usePropClick documents: r3f's onClick is not
  // reliable under ScrollControls here, and where it DOES arrive it arrives
  // first and re-arming is idempotent.
  usePropClick(unitIndex, "egg:clock:case", shove);
  useFrame((_, delta) => {
    const g = rock.current;
    if (!g || t.current < 0) return;
    t.current += Math.min(delta, 1 / 30); // a tab-switch delta would jump
    if (t.current > NUDGE_END) {
      g.rotation.z = 0;
      t.current = -1;
      return;
    }
    g.rotation.z =
      NUDGE_AMP *
      Math.exp(-NUDGE_DECAY * t.current) *
      Math.sin(NUDGE_RATE * t.current);
  });
  return (
    <EggClock
      unitIndex={unitIndex}
      hoverKey="egg:clock:floor"
      facePosition={[0, 1.15 * CLOCK_S, 0.0728 * CLOCK_S]}
      faceRadius={0.0676 * CLOCK_S}
    >
      {/* The rock pivots at this group's origin, which the model pipeline puts
          at the case's own base — so the clock turns on the floor rather than
          about its middle, and no part of it leaves the ground plane. */}
      <group ref={rock} name={CLOCK_CASE_NODE}>
        <EggTrigger
          unitIndex={unitIndex}
          hoverKey="egg:clock:case"
          onTrigger={shove}
        >
          {/* The pendulum is INSIDE the single mesh — a 15-tri rod at model
              y 0.513…0.966 with an 82-tri bob hanging off its foot, visible
              through the trunk's slot. Pendulum cuts those two islands out
              of the geometry and re-hangs them under their own suspension
              point, so the rod and bob swing and the case stands still.
              Defaults are the seconds-pendulum ones (2 s, 2.9° each way);
              nothing to tune here, and nothing in it is scale-dependent. */}
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
      </group>
    </EggClock>
  );
}

export default function UnitSystems({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
  /** The operating manual as a packed row rather than one GLB — see the mount
   * below. No covers: these are the manual's own spines, not library books. */
  const manualRow = useMemo(() => packRow(0.72, [], palette, 68), [palette]);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            {/* SPACING (H2). The readable width of a shelf is the plank's
                −1.60…+1.60 clipped by the desktop placard, whose left edge is
                (viewportWidth/2 − 528)/pxPerUnit — +0.427 on a 1280 × 900
                window, the punishing case. So every unit is really laying out
                −1.55 … +0.40, about 1.95 units, and this shelf was using
                −1.05 … +0.30 of it with a 0.5-wide hole at each end.
                Four objects now step across the whole run at roughly even
                pitch: frame −1.30, plant −0.78, print −0.28, pile +0.22. */}
            <BookPile palette={palette} x={0.22} salt={58} linkUnit={index} />
            {/* First light on a ridge, and the redwoods — "get outside" as
                a practice. They fill the bare left half of this shelf. */}
            <PhotoMount
              unitIndex={index}
              id="systems-ridge"
              position={[-1.3, deskFrameHeight(0.2) / 2, 0.05]}
              rotation={[-0.11, 0.26, -0.02]}
            >
              <DeskFrame
                src="/images/stacks/systems-ridge.jpg"
                palette={palette}
                textured={textured}
                width={0.28}
                height={0.2}
              />
            </PhotoMount>
            <PhotoMount
              unitIndex={index}
              id="systems-redwoods"
              position={[-0.28, polaroidSeat(TILT_REDWOODS), 0.14]}
              rotation={TILT_REDWOODS}
            >
              <Polaroid
                src="/images/stacks/systems-redwoods.jpg"
                palette={palette}
                textured={textured}
                anchor="contact"
              />
            </PhotoMount>
            {/* 0.16 → 0.18: at 0.16 the plant measured 0.12 × 0.27 × 0.14,
                a 1.35 u/m tabletop snake plant on a shelf whose books are
                drawn at 2.00. Everything hand-fitted to the pot mouth scales
                with it — the soil disc's radius AND its height, or the disc
                sinks back inside the rim it was cut to fill.
                The stiff upright leaves are the ones a draught would move,
                so it gets the same Sway the other plants in the world have,
                at a smaller amplitude and a slower rate than the leafy ones
                — a sansevieria rocks in its pot, it does not rustle. */}
            <group position={[-0.78, 0, 0]}>
              <HoverProp
                unitIndex={index}
                hoverKey="plant:sansevieria"
                lift={[0, 0.008, 0.014]}
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
              </HoverProp>
              <ContactShade
                color={palette.shadow}
                width={0.38}
                position={[0, 0.03, 0.06]}
              />
            </group>
          </group>
        }
      >
        {/* Top shelf, same H2 pass: manual −1.24, clock −0.63, checklist
            −0.15, print +0.28. The old run put the manual at −1.00 and left
            0.46 of dead plank outboard of it, then bunched the tray and the
            print into the right third where the placard eats them. */}
        {/* The operating manual, standing where the manual lives — a REAL
            per-spine row, not one GLB (owner: "these books still all hover
            together. they should be independent and ideally better models
            altogether"). ct-books.glb is a single mesh, so all 364 px of it
            reported one hoverKey and the whole prop lifted as a slab; every
            other book row in the world resolves per spine, and nothing in
            primitives.tsx could split a prop that is one object. packRow with
            no covers gives seven uprights and a leaner, each its own door into
            the manual and each with its own hinge.
            0.72 of row is a little wider than the 0.572 the GLB was, and it
            lands at −1.326…−0.675 from x −1.066: 0.274 clear of the plank end
            at −1.60 and 0.155 clear of the alarm clock at −0.63.
            No ContactShade here — BookRowMesh brings its own contact strip and
            two of them double-darken the wood. */}
        <group position={[-1.066, 0, 0]}>
          <BookRowMesh
            items={manualRow}
            palette={palette}
            salt={68}
            linkUnit={index}
            to="manual"
          />
        </group>
        <group position={[-0.63, 0, 0.08]}>
          {/* Canvas face registered to the GLB's measured dial: the front
              disc sits at local z 0.024, center y 0.0828, r 0.0614.
              1.6 → 1.4: this was the one prop in the world that was too BIG.
              At 1.6 it stood 0.154 world — a 0.077 m alarm clock next to a
              book row it reached 90% of the height of, where the real ratio
              is 56%. 1.4 lands it at 0.135, a twin-bell clock at the same
              2.00 u/m as the books beside it.
              The face constants are registered to the scale, so all three
              move with it: ×0.875 → y 0.1159, z 0.0354 (still 1.4mm proud of
              the paint, behind the bezel rim), r 0.0816 ≈ 0.95× the dial so
              the painted ticks never peek out around it.
              Egg: click and the hands wind to 3:45 — the wake time — hold,
              then wind on around to the visitor's live time. */}
          <EggClock
            unitIndex={index}
            hoverKey="egg:clock:alarm"
            facePosition={[0, 0.1159, 0.0354]}
            faceRadius={0.0816}
          >
            <React.Suspense fallback={null}>
              <ModelProp url="/models/alarm-clock.glb" dark={dark} scale={1.4} />
            </React.Suspense>
          </EggClock>
        </group>
        {/* The daily checklist, and the door to /routine — see RoutineBoard
            for why the paper tray that stood here had to go.
            It stands at x −0.15, where its 0.30 of board spans −0.30…0.00 and
            arrives whole at every window including 1280, which the 0.81-wide
            tray never did (it lost its right eighth there and its link with
            it). Seated by routineBoardSeat off its own tilt, so it stands on
            the wood rather than at a literal that goes stale the moment the
            board or the lean changes. */}
        <group position={[-0.15, routineBoardSeat(TILT_ROUTINE), 0.06]} rotation={TILT_ROUTINE}>
          <PropLink
            unitIndex={index}
            to="routine"
            hoverKey="link:routineboard"
            lift={[0, 0.018, 0.016]}
          >
            <RoutineBoard palette={palette} />
          </PropLink>
        </group>
        <ContactShade
          color={palette.shadow}
          width={0.42}
          position={[-0.15, 0.03, 0.1]}
        />
        {/* Sunrise over the water, beside the clock whose egg winds to 3:45.
            The unit is about getting up before everyone else; this is what
            that actually looks like.
            0.62 → 0.30: at 0.62 the print spanned 0.52…0.71 and the placard's
            left edge is +0.427 on a 1280 laptop, so two thirds of it was
            behind the panel. */}
        <PhotoMount
          unitIndex={index}
          id="systems-sunrise"
          position={[0.28, polaroidSeat(TILT_SUNRISE), 0.12]}
          rotation={TILT_SUNRISE}
        >
          <Polaroid
            src="/images/stacks/systems-sunrise.jpg"
            palette={palette}
            textured={textured}
            anchor="contact"
          />
        </PhotoMount>
      </ShelfUnit>
      {/* Grandfather clock on the ground at the LEFT flank — the statement
          prop that shifts the unit's grammar from "shelf" toward "room".
          See CLOCK_S for the scale and why it is the frame, not the metre,
          that sets it.
          x −1.95 → −1.98: at 1.90 the case's footprint, yawed 0.15 inside a
          unit that is itself yawed 0.10, reaches 0.331 from its axis, so
          −1.95 would put its right corner at −1.619 against a plank that ends
          at −1.60. −1.98 clears it by 0.049. */}
      <group position={[-1.98, -1.115, -0.15]} rotation={[0, 0.15, 0]}>
        <FloorClock unitIndex={index} dark={dark} />
      </group>
      <FootPool
        color={palette.shadow}
        size={[0.66, 0.44]}
        position={[-1.98, -1.115, -0.1]}
      />
    </group>
  );
}
