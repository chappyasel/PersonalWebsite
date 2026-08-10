"use client";

// Systems — CT Books as the operating manual, the alarm clock (live canvas
// face over the GLB dial), and a paper inbox tray; book pile + sansevieria
// below; the grandfather clock stands on the floor at the unit's left
// flank, ticking the same live time with its own rod and bob swinging
// inside the case. The 3:45 wake-up story lives in the click easter egg
// (EggClock).
import React from "react";

import { EggClock, Pendulum, Sway } from "../eggs";
import { ContactShade, FootPool } from "../GroundPool";
import PropLink, { HoverProp } from "../links";
import ModelProp from "../ModelProp";
import { InboxTray, Polaroid, polaroidSeat } from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import { BookPile, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

/** Rest tilts for this unit's two leaning prints. Named because each is used
 * twice — to pose the print, and to derive the height at which that pose lands
 * on the plank. They were mounted at a bare 0.1425, which was `oldHeight/2 ·
 * cos(lean)` for a Polaroid that has not been 0.24 wide since it was pinned to
 * the house scale, leaving both prints 1.5 cm off the wood. */
const TILT_REDWOODS: [number, number, number] = [-0.16, -0.2, 0.05];
const TILT_SUNRISE: [number, number, number] = [-0.15, -0.16, 0.03];

export default function UnitSystems({ palette, dark, index }: UnitProps) {
  const textured = useUnitLod(index);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <BookPile palette={palette} x={0.3} salt={58} linkUnit={index} />
            {/* First light on a ridge, and the redwoods — "get outside" as
                a practice. They fill the bare left half of this shelf. */}
            <PhotoMount
              unitIndex={index}
              id="systems-ridge"
              position={[-1.05, deskFrameHeight(0.2) / 2, 0.05]}
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
              position={[-0.2, polaroidSeat(TILT_REDWOODS), 0.14]}
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
            <group position={[-0.55, 0, 0]}>
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
        <group position={[-1.0, 0, 0]}>
          {/* The operating manual, standing where the manual lives. */}
          <PropLink
            unitIndex={index}
            to="manual"
            hoverKey="link:ctbooks"
            lift={[0, 0.028, 0.02]}
          >
            <React.Suspense fallback={null}>
              {/* 2.2 → 2.9. At 2.2 each of the six books stood 0.171 world
                  = a 0.085 m hardcover; the repo's own packed spines two
                  units over are 0.20–0.30 m. 2.9 puts the row at 0.225 tall
                  and 0.286 wide, still clear of the plank end at −1.6 and of
                  the alarm clock at −0.19. */}
              <ModelProp
                url="/models/ct-books.glb"
                dark={dark}
                rotation={[0, 0.25, 0]}
                scale={2.9}
              />
            </React.Suspense>
          </PropLink>
          <ContactShade
            color={palette.shadow}
            width={0.6}
            position={[0, 0.03, 0.08]}
          />
        </group>
        {/* −0.15 → −0.38. The tray came left to get out from behind the
            placard and landed 0.11 off the clock's shoulder; this reopens
            the gap so neither prop stands in front of the other. */}
        <group position={[-0.38, 0, 0.08]}>
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
        {/* Sunrise over the water, beside the clock whose egg winds to 3:45.
            The unit is about getting up before everyone else; this is what
            that actually looks like. */}
        <PhotoMount
          unitIndex={index}
          id="systems-sunrise"
          position={[0.62, polaroidSeat(TILT_SUNRISE), 0.1]}
          rotation={TILT_SUNRISE}
        >
          <Polaroid
            src="/images/stacks/systems-sunrise.jpg"
            palette={palette}
            textured={textured}
            anchor="contact"
          />
        </PhotoMount>
        {/* The tray is the door to the daily routine — /routine is a real
            destination that nothing in the world pointed at, and a tray of
            paper on the Systems shelf is the honest place to hang it.
            It moved 0.85 → 0.20 to be reachable at all: the desktop placard
            hides everything past world +0.427 at a 1280 window, and at 0.85
            the whole prop sat behind the panel. The tray then grew (objects
            .tsx scales it ×1.9 to a real letter tray), so at x 0.20 it spans
            −0.203…0.603 and loses its right eighth at 1280 rather than all of
            itself. That is the trade: the sunrise print takes the slot it
            left, a photograph losing an edge costs nothing, and a door that
            cannot be clicked costs the link. */}
        <group position={[0.2, 0, 0]}>
          <PropLink
            unitIndex={index}
            to="routine"
            hoverKey="link:inboxtray"
            lift={[0, 0.018, 0.016]}
          >
            <InboxTray palette={palette} />
          </PropLink>
          {/* 0.5 → 0.9. The shade never followed the tray's ×1.9, so a 0.81
              wide object was standing on a 0.5 wide shadow and floating at
              both ends. */}
          <ContactShade
            color={palette.shadow}
            width={0.9}
            position={[0, 0.03, 0.1]}
          />
        </group>
      </ShelfUnit>
      {/* Grandfather clock on the ground at the LEFT flank — the statement
          prop that shifts the unit's grammar from "shelf" toward "room".
          Dial measured at local (0, 1.150, 0.072) r 0.0711.
          1.15 → 1.37. At 1.15 the case stood 1.569 world and the Talks floor
          lamp — a 1.5 m lamp — out-topped it at 1.677, which is backwards by
          30%. 1.37 stands it at 1.869 (0.96 u/m, the floor family's scale,
          against a 1.95 m longcase) and 0.415 wide, so it still clears the
          plank end at −1.6345 from x −1.95. Every dial constant is
          registered to the scale and moves with it: ×1.191. */}
      <group position={[-1.95, -1.115, -0.15]} rotation={[0, 0.15, 0]}>
        {/* Same wind-to-3:45 egg as the alarm clock. */}
        <EggClock
          unitIndex={index}
          hoverKey="egg:clock:floor"
          facePosition={[0, 1.5755, 0.0998]}
          faceRadius={0.0926}
        >
          {/* The pendulum is INSIDE the single mesh — a 15-tri rod at model
              y 0.513…0.966 with an 82-tri bob hanging off its foot, visible
              through the trunk's slot. Pendulum cuts those two islands out
              of the geometry and re-hangs them under their own suspension
              point, so the rod and bob swing and the case stands still.
              Defaults are the seconds-pendulum ones (2 s, 2.9° each way);
              nothing to tune here. */}
          <Pendulum unitIndex={index}>
            <React.Suspense fallback={null}>
              <ModelProp url="/models/grandfather-clock.glb" dark={dark} scale={1.37} />
            </React.Suspense>
          </Pendulum>
        </EggClock>
      </group>
      <FootPool
        color={palette.shadow}
        size={[0.57, 0.38]}
        position={[-1.95, -1.115, -0.1]}
      />
    </group>
  );
}
