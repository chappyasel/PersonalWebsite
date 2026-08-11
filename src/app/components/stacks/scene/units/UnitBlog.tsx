"use client";

// Musings — leaning notebook spines (front three are the latest posts), a
// real open book mid-thought, headphones, tea, and a pinned corkboard;
// paper stack + pen cup below.
import React, { useMemo, useRef } from "react";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { EggTrigger, Sway, SteamCup } from "../eggs";
import Grabbable from "../Grabbable";
import { ContactShade } from "../GroundPool";
import PropLink, { HoverProp } from "../links";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { NotebookLean, PaperStack, Polaroid, SodaCan } from "../objects";
import { PhotoMount } from "../photos";
import { Bookend, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

/** The table lamp, with a switch on it.
 *
 * The room has three lamps and until now only the two angle-poise ones
 * answered — the same object behaving two different ways depending on which
 * shelf you were standing at. EggLamp cannot be reused here: it hard-codes
 * desk-lamp.glb and the whole LampGlow rig, while this lamp's only emitter
 * is the bare pointLight beside it. So the dimmer is local and small: one
 * damped factor writing the light's intensity, on the same curve as every
 * other easing in the world.
 *
 * The trigger wraps the MODEL only. Put the light inside it and the click
 * target becomes a sphere of empty air the size of the falloff. */
function TableLampSwitch({
  unitIndex,
  intensity,
  children,
}: {
  unitIndex: number;
  /** Lit intensity — the dimmer scales this, it never replaces it. */
  intensity: number;
  children: React.ReactNode;
}) {
  const on = useRef(true);
  const level = useRef(1);
  const light = useRef<THREE.PointLight>(null);
  useFrame((_, delta) => {
    const target = on.current ? 1 : 0;
    if (Math.abs(level.current - target) < 1e-3) {
      if (level.current === target) return; // settled
      level.current = target;
    } else {
      level.current = THREE.MathUtils.damp(level.current, target, 8, delta);
    }
    if (light.current) light.current.intensity = intensity * level.current;
  });
  return (
    <>
      <EggTrigger
        unitIndex={unitIndex}
        hoverKey="egg:lamp:table"
        onTrigger={() => {
          on.current = !on.current;
        }}
      >
        {children}
      </EggTrigger>
      {/* 0.44 → 0.463 → 0.560, and 1.1 → 1.158 → 1.26. The light is a SIBLING
          of the model, so the lamp's scale bump does not carry it, and
          `distance` is a world-space falloff radius that never inherits a
          parent scale either — both have to be walked by hand.
          0.560 is the G2 fix, and the owner's own guess at it was backwards:
          "the light source coming out of this lamp seems to flicker on
          movement. please fix (by moving the light source down a little?)".
          Measured cause — at 0.463 the emitter sat at model y 0.2315, which is
          INSIDE the finial knob (body island #0 runs y 0…0.2352 with a 0.0172
          world radius there), so peak irradiance was 3382·I on a knob whose
          four harp wires are only ~3 px across on screen. A blown core behind
          3-px wires aliases as the camera moves; that is the flicker. Moving
          the light DOWN drives it further into the urn and makes it worse.
          0.560 is model y 0.280, the middle of the shade void: the nearest
          geometry becomes the finial tip at 0.0896 world (125·I, 27× less
          peak) and the harp wires at 0.0920. The reach comes back up by the
          same 0.097 the light rose, or the shelf under it goes dark. */}
      <pointLight
        ref={light}
        position={[0, 0.56, 0]}
        intensity={intensity}
        distance={1.26}
        decay={2}
        color="#ffcf9a"
      />
    </>
  );
}

export default function UnitBlog({
  data,
  palette,
  dark,
  index,
  onOpenUrl,
}: UnitProps) {
  const textured = useUnitLod(index);
  const clickKeys = useMemo(
    () => data.blogPosts.map((post) => post.link),
    [data.blogPosts],
  );
  return (
    <ShelfUnit
      palette={palette}
      toneSeed={index}
      lower={
        <group>
          <group position={[0.18, 0, 0]}>
            <PaperStack palette={palette} linkUnit={index} />
            <ContactShade
              color={palette.shadow}
              width={0.55}
              position={[0, 0.02, 0.02]}
            />
          </group>
          {/* Pick it up and move it. Musings is the right unit to be the one
              that lets you touch things — it is the quiet end of the shelf,
              and a mug is the object a visitor's hand reaches for first.
              mug.glb is not a mug: it is a desk caddy — a cup holding pens, a
              ruler and a pair of SCISSORS, which is the "scissors cup" in the
              owner's note. Its bbox height 0.1991 is the scissor tips, so
              reading scale off the bbox undersized the cup badly: the vessel
              itself is only 0.0901 tall, which at the old scale 1 landed a
              4.5 cm egg cup on the shelf. 2.1 puts the cup at 0.095 m and the
              whole assembly, scissors included, at 0.21 m. */}
          <Grabbable
            unitIndex={index}
            hoverKey="grab:mug"
            base={[-0.62, 0, 0]}
            shadeColor={palette.shadow}
            shadeWidth={0.32}
          >
            <React.Suspense fallback={null}>
              <ModelProp url="/models/mug.glb" dark={dark} rotation={[0, 0.9, 0]} scale={2.1} />
            </React.Suspense>
          </Grabbable>
          {/* You write at night, under a lamp. Musings was the only unit
              with a writing story and no light of its own, and the gap from
              0.50 to the plank end was the largest visible hole in it.
              A second silhouette on purpose: an urn-base table lamp rather
              than a fourth copy of the angle-poise, which is already doing
              About and Talks. It also does real work above itself — the open
              book on the shelf overhead collapses to a beige lump in dark
              theme, and a warm source below and slightly behind gives its
              pages an edge. */}
          {/* 1.9 → 2.0, which is the CEILING and not the metric answer: a
              0.45 m table lamp wants 2.77 and the plank overhead is 0.6575
              away, so 2.0 (0.650 tall) is as much lamp as the gap takes. It
              also closes the last of the gap to the books at 2.0 u/m. */}
          <group position={[0.72, 0, -0.04]} rotation={[0, -0.5, 0]}>
            <TableLampSwitch unitIndex={index} intensity={dark ? 0.55 : 0.24}>
              <React.Suspense fallback={null}>
                <ModelProp
                  url="/models/lamp-table.glb"
                  dark={dark}
                  scale={2.0}
                />
              </React.Suspense>
            </TableLampSwitch>
            <ContactShade
              color={palette.shadow}
              width={0.274}
              position={[0, 0.02, 0.01]}
            />
          </group>
          {/* The last of the room's three cans — olive here, against the rust
              on Training and the cool blue on Projects, so no two read the
              same in either theme. It takes the gap the framed walk and the
              pen cup leave, which is the last bare run on this shelf. */}
          <group position={[-0.88, 0, 0.04]}>
            <SodaCan
              dark={dark}
              body={dark ? palette.spines[2] : palette.spines[7]}
              rotation={[0, 0.9, 0]}
            />
            <ContactShade
              color={palette.shadow}
              width={0.2}
              position={[0, 0.02, 0.02]}
            />
          </group>
          {/* Joshua Tree solo walk — the contemplative register of the
              unit, framed small on the empty lower-left.
              −1.00 → −1.25 (H2): this shelf's readable width is −1.55…+0.47
              and it was using −1.20…+0.88 of it, leaving 0.35 of bare plank
              at the end the eye lands on first. The frame, the pen cup and
              the paper each step 0.07 left; the table lamp at +0.72 does not
              move (its light rig is being rebuilt elsewhere this round). */}
          <PhotoMount
            unitIndex={index}
            id="musings-walk"
            position={[-1.25, 0.152, 0]}
            rotation={[-0.1, 0.14, 0]}
          >
            <RoundedBox
              castShadow
              args={[0.4, 0.3, 0.025]}
              radius={0.006}
              smoothness={4}
              position={[0, 0, -0.015]}
            >
              <meshStandardMaterial color={palette.frame} roughness={0.6} />
            </RoundedBox>
            {textured && (
              <React.Suspense fallback={null}>
                <LitImage
                  url="/images/stacks/musings-walk.jpg"
                  width={0.35}
                  height={0.26}
                  roughness={0.5}
                  position={[0, 0, -0.001]}
                />
              </React.Suspense>
            )}
          </PhotoMount>
        </group>
      }
    >
      <group position={[-0.7, 0, 0]}>
        <NotebookLean
          palette={palette}
          clickKeys={clickKeys}
          onNotebookClick={onOpenUrl}
          linkUnit={index}
        />
        <ContactShade
          color={palette.shadow}
          width={0.8}
          height={0.18}
          position={[0, 0.03, 0.1]}
        />
      </group>
      {/* The row's last spine leans away from the row with nothing holding
          it. An L-steel bookend catches it, and closes the gap between the
          notebooks and the headphones on the way. It is the least decorative
          object it is possible to put on a shelf: a row of notebooks stays
          upright because something holds it up.
          It was also, along with its two twins on Books, the only prop on
          this shelf with no answer to the pointer at all — it sits between
          rows where every single spine lifts. So it is authored 2.6° out of
          true, leaning the way the row pushes it, and the pointer eases it
          upright: the row has just been straightened. rest+settle is the
          same pair the photographs use, and it costs no new machinery. lift
          is zeroed because a bookend that rose off the wood would be a
          bookend holding nothing. */}
      <group position={[-0.4, 0, 0.02]}>
        <HoverProp
          unitIndex={index}
          hoverKey="hover:bookend:blog"
          lift={[0, 0, 0]}
          rest={[0, 0, -0.045]}
          settle={0.045}
        >
          <Bookend palette={palette} flip />
        </HoverProp>
      </group>
      {/* Cactus at the bare left plank end. A cactus and not the monstera
          for one reason: under a plank the monstera needs 0.82 of headroom
          against a gap of about 1.0, and this end of the shelf is where the
          eye lands first. The cactus needs 0.27. It also gives the unit a
          third vertical mass spread across its width, instead of one cluster
          left of centre.
          0.36 stays. The v5 sizing pass wanted 0.55 on the ground that the
          cactus stands 0.186 m against a real potted cactus's 0.30, which is
          true and is not the whole picture: it is already 0.268 m ACROSS
          against a real 0.28. The model is squat, not small, and a uniform
          0.55 would ship a 0.41 m-wide cactus — half again as wide as the
          real plant. It also has nowhere to go. At 0.36 the bowl already
          reaches x −1.588 against a plank that ends at −1.6, so anything
          past 0.376 hangs off the end, and sliding it inboard to make room
          walks it into the notebook row, which starts at about −1.1. */}
      <Sway unitIndex={index} amount={0.02} rate={0.37} phase={2.1}>
        <group position={[-1.32, 0, 0.03]} rotation={[0, 0.5, 0]}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/cactus.glb"
              dark={dark}
              variant="recolor"
              scale={0.36}
            />
          </React.Suspense>
        </group>
      </Sway>
      <ContactShade
        color={palette.shadow}
        width={0.3}
        position={[-1.32, 0.03, 0.05]}
      />
      {/* A book is a book, wherever it's lying — the open one opens the
          library, same as every spine and pile in the world. */}
      <PropLink
        unitIndex={index}
        to="books"
        hoverKey="link:openbook"
        lift={[0, 0.025, 0.02]}
      >
        <React.Suspense fallback={null}>
          {/* yaw −0.35 → −0.252, handed down by the shelf solve below rather
              than chosen. The book is the widest thing here — 0.71 of plank
              once yawed — so its angle is a depth budget, not a flourish:
              every degree it turns costs the corkboard behind it clearance. */}
          <ModelProp
            url="/models/open-book.glb"
            dark={dark}
            variant="tinted"
            tints={{ Beige: palette.pages, DarkRed: palette.spines[3] }}
            position={[0.85, 0, 0.08]}
            rotation={[0, -0.252, 0]}
            scale={0.7}
          />
        </React.Suspense>
      </PropLink>
      {/* Cup of tea beside the open book — mid-thought, mid-sip.
          Egg: click and a few faint steam wisps rise off the surface.
          The GLB's three islands measure cup 0.046 tall on a 0.113 saucer, so
          2.4 lands a 5.5 cm cup on a 13.6 cm saucer — a teacup rather than the
          doll's cup 2.0 gave.
          It also had to move. At [0.55, 0.22] the cup was not beside the open
          book, it was INSIDE it: measured surface gap 0.0012 at y 0.073, i.e.
          the cup's body and the raised page occupied the same space, which
          the old scale merely hid.
          [0.41, 0, −0.09] comes out of the whole-shelf solve, and it is kept
          FORWARD of the corkboard's base on purpose: an earlier solve tucked
          the cup under the leaning board, which is geometrically valid and
          visually useless for a prop whose whole job is to sit there steaming.
          Steam origin follows the rim (0.049 × 2.4). */}
      <SteamCup
        unitIndex={index}
        hoverKey="egg:tea"
        steamAt={[0.41, 0.122, -0.09]}
        dark={dark}
        always
      >
        <React.Suspense fallback={null}>
          <ModelProp
            url="/models/cup-tea.glb"
            dark={dark}
            position={[0.41, 0, -0.09]}
            rotation={[0, 0.6, 0]}
            scale={2.4}
          />
        </React.Suspense>
      </SteamCup>
      {/* 2.0 put the band 0.121 m tall and the ear cups 4.6 cm across — a
          child's pair. 2.9 is the compromise between matching real over-ear
          height (0.20 m, wants 3.3) and real cup-to-cup width (0.17 m, wants
          2.55); this model is proportionally wider than the real thing, so
          neither target is reachable alone. Both land within ~13%. */}
      <Grabbable
        unitIndex={index}
        hoverKey="grab:headphones"
        base={[0.11, 0, 0.14]}
        shadeColor={palette.shadow}
        shadeWidth={0.48}
      >
        <React.Suspense fallback={null}>
          <ModelProp url="/models/headphones.glb" dark={dark} rotation={[0, 0.5, 0]} scale={2.9} />
        </React.Suspense>
      </Grabbable>
      {/* Corkboard leaning against the shelf back, four pinned instant
          prints from the Instagram curation round.
          It was at x 1.02, which is the reason the owner still called this
          unit empty after v4 gave it the biggest object it has. The desktop
          placard starts somewhere between local x +0.28 and +1.51 depending
          on the window — and moves ±0.49 more as the camera pans with the
          pointer — so the board spanned 0.67…1.37 and was more than half
          behind the panel on a 1440 window and essentially gone at 1280. Its
          largest v4 addition never arrived on screen.
          0.62 was not enough either, for two reasons. It landed inside both
          the tea cup and the open book — an overlap a screenshot cannot show
          you, because interpenetration and layering look identical from one
          camera. And +0.85 is not the safe line at every window: the panel
          takes a FIXED 528px off the right, while the camera's vertical fov
          holds the world at a constant 239 px/unit, so the threshold is
          (viewportWidth/2 − 528) / 239 and a wider window is BETTER, not
          worse. Measured against the running app: 1280 → +0.47, 1440 → +0.80,
          1600 → +1.14. 0.14 puts the board at −0.185…0.468, which is the
          rightmost x that arrives whole on a 1280 laptop — the narrowest
          window this is likely to be read on, and the one where the board was
          most invisible.
          z stays −0.18 and is NOT free: the board leans back 0.28 rad, and a
          leaning board has to lean on something. At its old x 1.02 its top
          corner reached the vertical strap at |x| 1.315; inside +0.85 there
          is no strap to reach, so the rear of the plank is the only thing
          left. −0.18 sends the top to z −0.435, about a centimetre past the
          back edge — which is what leaning against the back means, and is
          invisible from a camera in front.
          The board still overlaps the tea and the book in SCREEN space, which
          is the gain: nothing in this unit overlapped anything, which is part
          of why it read as a row of separated items rather than as a shelf.
          It just no longer overlaps them in space — 0.052 and 0.081 of real
          surface clearance, by dense sampling.
          v5 sizing: 0.9 → 1.3. At 0.9 the board measured 0.34 × 0.24 m
          against the 0.60 × 0.45 of the smallest pin board you can buy, i.e.
          1.2 units per metre on a shelf whose books are at 2.0 — it was
          undersized on BOTH axes, which is the one honest case for growing
          something. It does not reach the metric 1.7, and the reason is the
          placard: the panel takes a fixed 528 px off the right and this unit
          sits at z −0.55, where the camera holds 239.6 px per world unit, so
          the safe right edge on a 1280 laptop is +0.467 and 1.7 would put
          0.29 of board behind the panel. 1.3 spans 0.945 across, so the
          centre walks from +0.14 to −0.01 to keep that same right edge, and
          the board grows LEFTWARD over the bookend and the notebook row —
          which it should, since screen-space overlap is the thing this unit
          was short of.
          Lean −0.28 → −0.23 for the same reason it was −0.28 at 0.9: the
          board leans on the back of the plank, and a taller board on the old
          lean sent its top corner 0.12 past the rear edge instead of the
          centimetre that "leaning on the back" means.
          The pins ride along, and they had their own version of the same
          bug — 0.11 where every other Polaroid in the world is 0.24, the
          same physical print at two sizes 2.2× apart. 0.176 is the size a
          real 600-series print wants at 2.0 u/m, and it is now the only one
          on the board. Their z steps 0.022 → 0.028 because the board's own
          thickness grew with it; at 0.022 the prints would have been inside
          the cork. */}
      {/* y +0.0341, not the plank's own 0. Both rotations here turn the board
          about the group origin, which the model pipeline puts at the board's
          BASE, so the lean and the roll each drive a bottom corner under the
          wood: the −0.23 lean sinks the bottom-back edge by |z_back|·sin 0.23
          and the +0.02 roll drops a bottom side corner by (w/2)·sin 0.02. A
          board leaning on the back of a plank pivots on its bottom FRONT edge
          in life, and this one pivots on its middle, which is why it read as
          sunk into the wood by 1.70 cm. Not derivable at the call site — the
          footprint is in corkboard.glb — so it is the figure
          stacks-floaters.mjs measured. Change the lean, the roll or the 1.3
          scale and re-run the detector; do not nudge this by eye. */}
      <group position={[-0.01, 0.0341, -0.18]} rotation={[-0.23, 0, 0.02]}>
        {/* The yaw lives on the HOVER, not on the group: the cork is the one
            thing on this board that answered nothing, while all four pins
            already do. Hovering the board itself eases its 0.35 out of true
            toward square so the pinned prints turn to face you, and the pins
            come with it because they are pinned to it. settle 0.14 takes
            about 40% of the turn — enough to read as the board being nudged
            straight, not enough to look motorised. */}
        <HoverProp
          unitIndex={index}
          hoverKey="hover:corkboard"
          lift={[0, 0, 0]}
          rest={[0, 0.35, 0]}
          settle={0.14}
        >
          <React.Suspense fallback={null}>
            <ModelProp url="/models/corkboard.glb" dark={dark} scale={1.3} />
          </React.Suspense>
          {[
            { src: "/images/stacks/pin-dunes.jpg", x: -0.26, y: 0.45, roll: -0.08 },
            { src: "/images/stacks/pin-trail.jpg", x: 0.18, y: 0.48, roll: 0.1 },
            { src: "/images/stacks/pin-creek.jpg", x: -0.23, y: 0.17, roll: 0.04 },
            // Fourth pin: alone on an empty shore, walking away — the quietest
            // frame in the archive, and the board had room low-right.
            { src: "/images/stacks/musings-shore.jpg", x: 0.22, y: 0.15, roll: -0.06 },
          ].map((pin) => (
            // A pinned print can only come toward you: the brass holds its top
            // corner, so the standing lift's rise would tear it off the board.
            // The pin rides along, and the roll levels out under the pointer.
            <PhotoMount
              key={pin.src}
              unitIndex={index}
              id={pin.src}
              position={[pin.x, pin.y, 0.028]}
              rotation={[0, 0, pin.roll]}
              lift={[0, 0, 0.01]}
            >
              <Polaroid
                src={pin.src}
                palette={palette}
                size={0.176}
                textured={textured}
              />
              <mesh position={[0, 0.115, 0.012]}>
                <sphereGeometry args={[0.01, 10, 10]} />
                <meshStandardMaterial
                  color={palette.hub}
                  metalness={0.4}
                  roughness={0.4}
                />
              </mesh>
            </PhotoMount>
          ))}
        </HoverProp>
      </group>
      <ContactShade
        color={palette.shadow}
        width={0.85}
        position={[-0.03, 0.03, -0.07]}
      />
    </ShelfUnit>
  );
}
