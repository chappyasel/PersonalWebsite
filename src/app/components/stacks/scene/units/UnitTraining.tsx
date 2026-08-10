"use client";

// Training — real bumper plates leaning against the shelf back with a
// kettlebell, a loaded barbell lying along the lower shelf behind the
// dumbbell and basketball, and a golf club propped against the unit's side
// (the only prop tall enough to demand the floor — head on the ground, shaft
// on the lower plank's outer corner, both contacts solved from the model's
// triangles). Every piece of iron — plates, kettlebell, barbell, dumbbell —
// opens the training log.
import { ContactShade, FootPool } from "../GroundPool";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { BounceProp, EggTrigger, RollBall } from "../eggs";
import PropLink from "../links";
import { Polaroid, polaroidSeat } from "../objects";
import { DeskFrame, PhotoMount, deskFrameHeight } from "../photos";
import { BookPile, BumperPlates, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useEffect, useRef } from "react";
import type * as THREE from "three";

import { useStacks } from "../../store";

import type { UnitProps } from "./types";

/** The club's grip tip, in the frame ModelProp draws it in — scale 1.44 and
 * yaw −1.0, BEFORE the lean. Read off the .glb: the highest vertex lands at
 * (0.0638, 1.1069), and 1.1069 is the model's own 0.7687 height times 1.44, so
 * the number checks itself. z is dropped on purpose — the swing turns about z
 * and a z offset in the pivot changes nothing about the result.
 *
 * This is the SWING PIVOT. Re-export the model or change `scale` and it is
 * stale; it is derived, not tuned, so re-measure rather than nudge. */
const CLUB_GRIP: [number, number, number] = [0.0638, 1.1069, 0];

/** Peak of the first arc, radians about the grip. Swept against the model's
 * own triangles, 0.22 lifts the head's sole 0.129 world off the floor and
 * carries it 0.196 away from the shelf — 13 cm and 20 cm at the floor's ~0.96
 * units per metre. A knock with weight in it, well short of a fall. */
const SWING_PEAK = 0.22;
/** Per second. Two visible arcs — 0.22 then 0.031 — and then nothing. */
const SWING_DECAY = 2.6;
/** rad/s. Half a period — one arc out and back — is π/4.2 = 0.75 s. */
const SWING_RATE = 4.2;
/** When the first arc tops out. NOT π/2ω: the product e^(−λt)·sin(ωt) peaks
 * where its derivative vanishes, at atan(ω/λ)/ω = 0.242 s, a third of a period
 * EARLIER than |sin| alone does. Normalising against π/2ω instead shipped a
 * 0.264 rad swing while this file claimed 0.22 — the harness read it back off
 * the scene graph, which is the only reason it was caught. */
const SWING_TOP = Math.atan(SWING_RATE / SWING_DECAY) / SWING_RATE;
/** Envelope scale that makes the first peak exactly SWING_PEAK. */
const SWING_AMP =
  SWING_PEAK /
  (Math.exp(-SWING_DECAY * SWING_TOP) * Math.sin(SWING_RATE * SWING_TOP));
/** Seconds. By 2.2 the envelope is 0.005 rad — half a centimetre at the head. */
const SWING_END = 2.2;

const CLUB_HOVER = "egg:golfclub";

/** Named so the harness can read the swing off the scene graph
 * (`window.__stacks.node(CLUB_NODE)`) instead of off pixels — the camera's idle
 * bob makes every region of the frame "move", so a screenshot proves nothing
 * about which object turned. Same reason PENDULUM_NODE has a name. */
export const CLUB_NODE = "stacks-golf-swing";

/**
 * Click the club and it swings once, about the GRIP.
 *
 * The pivot is the point a pair of hands would be on, so the head is what
 * travels — an arc out and back, twice, decaying to nothing. It is deliberately
 * ONE-SIDED. The club's rest pose has its head on the floor and its shaft on
 * the shelf's lower-plank corner, so the only direction it can move without
 * driving the head through the ground is away from the shelf: a positive angle
 * about z swings the head down and right, into the floor. `|sin|` is what makes
 * it one-sided, and the kink at each zero crossing is not a defect — it is the
 * head landing back on the floor and rebounding, which is what a knocked club
 * actually does. Swept over 2.2 s of frames the lowest point of the model never
 * goes more than 0.03 mm below the ground plane.
 *
 * Not Pendulum: that one runs forever, and a club that never stops swinging is
 * a metronome.
 */
function ClubSwing({
  unitIndex,
  children,
}: {
  unitIndex: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  /** Seconds since the click; negative means at rest and nothing is written. */
  const t = useRef(-1);
  const start = () => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    t.current = 0;
  };
  useClubClick(unitIndex, start);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g || t.current < 0) return;
    t.current += Math.min(delta, 1 / 30); // a tab-switch delta would jump
    if (t.current > SWING_END) {
      g.rotation.z = 0;
      t.current = -1;
      return;
    }
    g.rotation.z =
      -SWING_AMP *
      Math.exp(-SWING_DECAY * t.current) *
      Math.abs(Math.sin(SWING_RATE * t.current));
  });
  return (
    <EggTrigger
      unitIndex={unitIndex}
      hoverKey={CLUB_HOVER}
      // Kept as a second path rather than removed: where r3f DOES deliver the
      // click it arrives first, and re-arming the swing is idempotent.
      onTrigger={start}
    >
      {/* Pivot at the grip, then the same offset back out, so everything below
          keeps the coordinates it would have had without the swing. */}
      <group ref={ref} name={CLUB_NODE} position={CLUB_GRIP}>
        <group position={[-CLUB_GRIP[0], -CLUB_GRIP[1], -CLUB_GRIP[2]]}>
          {children}
          {/* A driver's shaft is 1 cm of geometry and lands on screen as a
              four-pixel diagonal — measurably hittable, but only if you aim.
              Zero-opacity proxy down the length of it, the same trick the golf
              ball beside it uses, kept narrow so it claims the club and not the
              floor around it. Spans x −0.028..0.092, which is the shaft's own
              0..0.064 with a margin, rather than the centred box that used to
              miss the grip end by 1.4 cm. */}
          <mesh position={[0.032, 0.57, -0.02]}>
            <boxGeometry args={[0.12, 1.14, 0.12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </EggTrigger>
  );
}

/**
 * The swing rides a window `pointerup` keyed off the hover slot rather than
 * r3f's `onClick`, which is NOT reliable in this scene.
 *
 * r3f only delivers `onClick` to an object that was in the hit list at
 * POINTERDOWN, and `Grabbable.tsx:262-273` documents that pointerdown does not
 * dispatch under ScrollControls here. The failure is asymmetric and that is
 * what makes it expensive: a synthetic mouse.down/mouse.up from a test harness
 * DOES fire the handler, so the mechanic passes every automated check while
 * never firing under a real trackpad. `SitChair.tsx` and the Golden Gate
 * launcher both settled on this same idiom.
 *
 * `EggTrigger` stays for the hover slot and the cursor — the slot is what this
 * listener keys off, so the club can only be swung from where the club is, and
 * gating on the active unit stops it answering clicks two units away.
 */
function useClubClick(unitIndex: number, onSwing: () => void) {
  const swing = useRef(onSwing);
  swing.current = onSwing;
  useEffect(() => {
    // Where the press started, so a drag across the club still travels
    // instead of swinging it — the same intent as EggTrigger's `e.delta > 6`.
    let downX = 0;
    let downY = 0;
    let downOn = false;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downOn = useStacks.getState().hovered === CLUB_HOVER;
    };
    const onUp = (e: PointerEvent) => {
      if (!downOn) return;
      downOn = false;
      const s = useStacks.getState();
      if (s.hovered !== CLUB_HOVER) return;
      if (s.activeUnit !== unitIndex) return; // → the tap plane travels
      if (s.panelState !== "closed" || s.modalOpen || s.dragging) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      swing.current();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [unitIndex]);
}

/** Declared once because it is used twice — as the mount's rotation and as
 * the input to polaroidSeat. A lean typed into one and not the other is the
 * exact bug this scene has regrown four times. */
const GOLF_FLAG_LEAN: [number, number, number] = [-0.16, -0.08, 0.06];

export default function UnitTraining({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <PropLink
              unitIndex={index}
              to="weightlifting"
              hoverKey="link:dumbbell"
              lift={[0, 0.018, 0.015]}
            >
              <React.Suspense fallback={null}>
                {/* 1.75, from the model's own bbox: the GLB is 0.2331 long per
                    unit of scale, so 1.75 is a 0.408 m dumbbell — a 15 kg
                    hex, the size the plates and the bar imply. At 1.27 it was
                    0.296 m, a 5 kg toy lying next to a full-size basketball,
                    which is the pairing that read wrong.
                    x −0.15 → −0.30: at 1.75 with the 0.5 yaw it spans 0.870,
                    and the ball's left edge is at 0.180, so the old centre
                    left 0.005 between them. −0.30 gives 0.045 of air. */}
                <ModelProp
                  url="/models/dumbbell.glb"
                  dark={dark}
                  atlasOverride={{ tint: "#8d857c", roughness: 0.55 }}
                  position={[-0.3, 0, -0.05]}
                  rotation={[0, 0.5, 0]}
                  scale={1.75}
                />
              </React.Suspense>
            </PropLink>
            {/* Egg: one soft bounce per click, landing exactly back. */}
            <BounceProp unitIndex={index} hoverKey="egg:basketball">
              <React.Suspense fallback={null}>
                {/* Worn-leather tint mutes the stock arcade orange; normals
                    weld-smoothed at load (it shipped faceted).
                    Re-seated at [0.38, 0, 0]. Two separate errors were fixed:
                    y was 0.046 on a model whose bbox already bottoms at 0, so
                    the ball hovered 2.3 cm off the wood; and z 0.2 with a
                    0.216 radius hung 0.196 of it past the plank's front lip
                    (0.22) — nine tenths of the ball was over thin air, held
                    up by 2 cm of plank. x 0.38 is the one slot left between
                    the dumbbell and the barbell's plate stack.
                    0.39 → 0.435 is the whole of the size fix: the GLB is
                    0.5525 across per unit of scale, so 0.435 is 0.240 m,
                    a men's size 7 ball to the millimetre. z −0.02 → −0.04
                    because the radius grew to 0.240 and the plank's front lip
                    is at 0.22 — at the old z the ball's front edge crossed
                    it by half a millimetre. */}
                <ModelProp
                  url="/models/basketball.glb"
                  dark={dark}
                  variant="tinted"
                  tintAll="#b39072"
                  roughness={0.78}
                  smoothNormals
                  position={[0.42, 0, -0.04]}
                  rotation={[0, 1.2, 0]}
                  scale={0.435}
                />
              </React.Suspense>
            </BounceProp>
            <PropLink
              unitIndex={index}
              to="weightlifting"
              hoverKey="link:barbell"
              lift={[0, 0.018, 0.015]}
            >
              <React.Suspense fallback={null}>
                {/* Zsky barbell (CC-BY, credited) lying along the shelf back.
                    The GLB is a true Olympic bar — 3.2454 long with 0.6585
                    plates, the real 2.2 m / 0.45 m ratio to three decimals —
                    so its scale is set by what the shelf can physically take,
                    not by taste.
                    0.94 is that limit, and the limit is HEADROOM, not the
                    plate stack the old note blamed. A loaded bar rests on its
                    discs, so the bar sits at exactly the plate radius
                    (0.3288 per unit of scale) and the plate's top is twice
                    that. The gap from this plank to the underside of the one
                    above is 0.6575, so the largest disc that fits under it is
                    0.6575 across: scale 0.999 flush, 0.94 with 4 cm of air.
                    Everything else clears at 0.94 — the bar is 3.05 long
                    against a 3.2 plank, and the outer plate lands at |x|
                    1.463 inside the 1.6 end.
                    What this CANNOT be is metrically right. A 0.45 m bumper
                    plate is 0.90 world units and no shelf in this bookcase is
                    0.90 tall, so the honest ceiling is a 0.31 m plate: 1.29×
                    the basketball where the real pair is 1.88×. A full-size
                    bar needs the floor or a shorter home bar; it does not
                    need a bigger number here.
                    z −0.32, not the −0.08 that would centre the disc on the
                    plank. The BAR is a rod running the full width at the
                    plate radius, and a 0.48 basketball is impaled by it at
                    any z within 0.29 — there is no seat on this shelf for a
                    ball under a full-width bar. Pushing the iron to the back
                    buys that clearance; the cost is a quarter of each plate
                    arcing past the plank's back edge, in the air, which is
                    what a 0.62 plate on a 0.6-deep shelf actually does. That
                    overhang is invisible: the top plank's back edge cuts the
                    sight line at y −0.042 and the whole of it sits below.
                    The contact point stays on the wood, 0.06 inside the back
                    edge. */}
                <ModelProp
                  url="/models/barbell.glb"
                  dark={dark}
                  variant="tinted"
                  tints={{
                    Iron1Barbell1: palette.hub,
                    Steel1Barbell1: "#8a8f94",
                  }}
                  roughness={0.45}
                  position={[0, 0, -0.32]}
                  rotation={[0, 0.02, 0]}
                  scale={0.94}
                />
              </React.Suspense>
            </PropLink>
            {/* Framed gym photo fills the bare lower-left (audit §2.5) —
                the SF Gyms mirror shot, the one that survives 300px. */}
            {/* Tough Mudder, under the wire and grinning — effort without
                the posing register he rules out. */}
            <PhotoMount
              unitIndex={index}
              id="training-mud"
              position={[-0.42, 0.1425, 0.16]}
              rotation={[-0.14, -0.22, -0.04]}
            >
              <Polaroid
                src="/images/stacks/training-mud.jpg"
                palette={palette}
                textured={textured}
              />
            </PhotoMount>
            {/* z 0.03 → 0.09. The frame stays where it was in x; it is the
                barbell that moved back and grew, and its outer plate shares
                this frame's x span. At scale 0.94 the disc's front face
                reaches z −0.011, and the frame's own back corner (0.09 less
                its 0.018 offset, 0.015 half-depth and the 0.027 the −0.1 tilt
                throws back) sits at 0.030 — clear by 0.041, and still 0.07
                inside the plank's front lip. */}
            <PhotoMount
              unitIndex={index}
              id="gym-mirror"
              position={[-1.12, 0.272, 0.09]}
              rotation={[-0.1, 0.16, 0]}
            >
              <RoundedBox
                castShadow
                args={[0.42, 0.54, 0.03]}
                radius={0.008}
                smoothness={4}
                position={[0, 0, -0.018]}
              >
                <meshStandardMaterial color={palette.frame} roughness={0.6} />
              </RoundedBox>
              {textured && (
                <React.Suspense fallback={null}>
                  <LitImage
                    url="/images/stacks/gym-mirror.jpg"
                    width={0.36}
                    height={0.48}
                    roughness={0.5}
                    position={[0, 0, -0.001]}
                  />
                </React.Suspense>
              )}
            </PhotoMount>
          </group>
        }
      >
        {/* Two bumper plates with a real through-bore, leaning against the
            shelf back — the CC-BY porcelain proxy read as dinnerware
            (owner-killed at browse).
            The ×1.29 is a group scale rather than new radii because
            BumperPlates keys its discs to the barbell's own plate on purpose
            (see primitives), and the bar just grew by the same 1.29. Both
            plates and their contact shade sit at y 0 inside this group, so a
            uniform scale keeps every one of them on the wood.
            x −0.95 → −1.25 because the pair grew leftward and rightward at
            once: the big disc now spans −1.57..−0.93 (0.03 off the plank end)
            and the small one −1.00..−0.47, which is the whole left third of
            the shelf. That is what a 0.31 m plate costs, and it is why the
            squat frame and the kettlebell moved right below. */}
        <group position={[-1.25, 0, -0.08]} scale={1.29}>
          <BumperPlates linkUnit={index} />
          <ContactShade
            color={palette.shadow}
            width={1.0}
            height={0.22}
            position={[0.19, 0.04, 0.12]}
          />
        </group>
        <PropLink
          unitIndex={index}
          to="weightlifting"
          hoverKey="link:kettlebell"
          lift={[0, 0.018, 0.015]}
        >
          <React.Suspense fallback={null}>
            {/* 1.1 → 2.0: the GLB is 0.140 tall per unit of scale, so 2.0 is
                a 0.28 m bell — a 16 kg competition kettlebell, and twice the
                height of the book pile beside it, which is the ratio those
                two objects actually have.
                x −0.15 → 0.02 to clear the squat frame on its left, which the
                grown plates pushed right. Nothing is above this shelf, so the
                new 0.56 of height costs nothing. */}
            <ModelProp
              url="/models/kettlebell.glb"
              dark={dark}
              variant="tinted"
              tints={{ phong1SG: palette.hub }}
              roughness={0.5}
              position={[0.02, 0, 0.1]}
              rotation={[0, -0.5, 0]}
              scale={2.0}
            />
          </React.Suspense>
        </PropLink>
        <group position={[0.75, 0, 0]}>
          <BookPile palette={palette} salt={31} linkUnit={index} />
        </group>
        {/* Chappaquiddick pin-flag print — the golf half of the training
            story, leaning between kettlebell and pile. */}
        <PhotoMount
          unitIndex={index}
          id="golf-flag"
          position={[0.32, polaroidSeat(GOLF_FLAG_LEAN), 0.12]}
          rotation={GOLF_FLAG_LEAN}
        >
          {/* 0.215 → 0.176. A Polaroid 600 print is 88 × 107 mm, which is
              0.176 wide here; the same object was being drawn at four
              different sizes across the world.
              Anchored at the contact edge and seated by polaroidSeat, which
              retires the literal 0.1425 that left it 0.93 cm off the wood —
              that number was half the height of a print this no longer is.
              The lean is declared once and feeds both the mount and the seat
              so they cannot drift apart. */}
          <Polaroid
            src="/images/stacks/golf-flag.jpg"
            palette={palette}
            size={0.176}
            textured={textured}
            anchor="contact"
          />
        </PhotoMount>
        {/* Racked and folded over the bar after a heavy set. The v4 audit
            concluded no mid-lift still existed in any archive and only a
            video frame-grab could supply one; it was in the Twitter export —
            which is also why this one links: the tweet id came through
            verbatim in the archived filename. */}
        <PhotoMount
          unitIndex={index}
          id="training-squat"
          position={[-0.32, deskFrameHeight(0.23) / 2, 0.12]}
          rotation={[-0.09, 0.2, 0.02]}
          href="https://x.com/i/status/1742265325423337870"
        >
          <DeskFrame
            src="/images/stacks/training-squat.jpg"
            palette={palette}
            textured={textured}
            width={0.24}
            height={0.23}
          />
        </PhotoMount>
      </ShelfUnit>
      {/* Golf club propped against the unit's LEFT side (the right hides behind
          the desktop placard). 1.5 → 1.44: a driver is 1.15 m, and the floor
          props in this world are drawn at the BOOKCASE's ~0.96 units per metre
          rather than the shelf's 2.0, which puts the shaft at 1.1069 world
          (0.7687 in the .glb × 1.44).

          IT NOW TOUCHES TWO THINGS, and both numbers below are solved from the
          model's triangles rather than chosen:

          - The head is on the GROUND at −1.115. y −1.1249, not the ground's own
            −1.115, because the −0.36 lean rotates the club's contact footprint
            about THIS group's origin and the drop is 0.0099. A tilted object's
            contact point is not its bounding-box minimum; that mistake is the
            single most repeated bug in this scene.
          - The shaft rests on the LOWER PLANK'S OUTER TOP EDGE — the corner at
            x −1.6 (half of ShelfUnit's 3.2 width), y −0.6925 (SHELF.lower).
            x −1.99 → −1.8489 is what puts it there. −1.8495 leaves the shaft
            clear of the corner and −1.8489 has it touching, so the contact is
            good to 0.018 mm and lands on the shaft (Golf_Club_2) at z −0.156,
            comfortably inside the plank's own −0.38..0.22.

          Which anchor is available is not a matter of taste. The club is 1.1069
          long, so from the floor it can reach y −0.0081 at best — it CANNOT get
          to the top plank's corner at +0.07, and it would have to lie at 67°
          off vertical for the grip tip to meet the lower plank's END FACE. The
          lower plank's top corner is the only edge a 1.1 m club standing on
          this floor can lean on, and it fixes the base x once the lean is
          given. Above the contact the shaft carries on into the open left bay
          and the grip ends at (−1.402, −0.111): 0.111 clear of the top plank
          above it and 0.037 clear in x of the gym-mirror frame, which is in any
          case 0.2 away in z.

          Egg: click and it swings once about the grip — see ClubSwing. */}
      <group position={[-1.8489, -1.1249, -0.1]} rotation={[0, 0, -0.36]}>
        <ClubSwing unitIndex={index}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/golf-club.glb"
              dark={dark}
              variant="tinted"
              tints={{
                M_PCL_Flat_Black: palette.hub,
                M_PCL_Flat_Grey_Light: palette.metal,
                // Flat chrome-grey club face — the cream tint read as a
                // wicker-weave tile under raking light (audit §3-Training).
                M_PCL_Flat_White_Darker: "#9aa0a4",
              }}
              rotation={[0, -1.0, 0]}
              scale={1.44}
            />
          </React.Suspense>
        </ClubSwing>
      </group>
      {/* Procedural golf ball at the club head — it only reads as golf in
          the club's company, which is exactly the company it keeps.
          Egg: click and it rolls a few cm, settles, rolls back next click
          (RollBall carries its own FootPool so the shadow rides along).
          Left where it was while the club moved 0.14 right: the head now spans
          x −1.893..−1.781 and z −0.135..−0.044, so the ball sits just off its
          toe and 0.10 in FRONT of it in z. It is deliberately outside the swing
          plane — see ClubSwing; the club is not allowed to pretend to hit it. */}
      <RollBall
        unitIndex={index}
        hoverKey="egg:golf"
        palette={palette}
        position={[-1.78, -1.115, 0.06]}
      />
      {/* Under the head, which is the club's only ground contact — the pool
          followed the base x and the head's own z footprint (−0.09), not the
          old wrapper origin it was copied from. */}
      <FootPool
        color={palette.shadow}
        size={[0.42, 0.3]}
        position={[-1.85, -1.115, -0.09]}
      />
    </group>
  );
}
