"use client";

// About — framed portrait, calling cards, mug, and a globe (he has the
// travel to claim it); desk lamp + book pile below.
import React from "react";

import { proxied } from "../../theme";
import { EggLamp, SpinProp, Sway } from "../eggs";
import Grabbable from "../Grabbable";
import { ContactShade, FootPool } from "../GroundPool";
import ModelProp from "../ModelProp";
import {
  CardStack,
  DeskApple,
  polaroidSeat,
  Polaroid,
  PortraitFrame,
  postcardSeat,
  PostcardPrint,
} from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import { BookPile, ShelfUnit } from "../primitives";
import SitChair from "../SitChair";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

export const PORTRAIT_SRC = "/images/about/profile.jpg";

/**
 * Rest tilts for the leaning prints on this unit, named rather than written
 * inline, because each one is used TWICE: once to pose the print and once to
 * work out the height at which that pose touches the plank. Inline literals
 * would let the two drift apart, which is the whole bug this replaces.
 *
 * Every print here used to be mounted at a bare 0.1425 (or 0.0735 for the
 * postcards). Those were `oldHeight/2 · cos(lean)` for sizes the prints have
 * not been since Polaroid shrank to 0.176 and PostcardPrint grew to
 * 0.296 × 0.21 — so the instant prints stood 1.6–1.8 cm off the wood and the
 * postcards sat 1.8–2.2 cm INTO it. Nothing in the source looked wrong,
 * because a bare number cannot look wrong. `polaroidSeat`/`postcardSeat`
 * derive the contact height from the print's real box and this exact tilt, so
 * changing either the size or the lean now carries the mount with it.
 */
const TILT_BROTHERS: [number, number, number] = [-0.16, 0.22, 0.03];
const TILT_BEACH: [number, number, number] = [-0.17, 0.1, -0.04];
const TILT_BROS: [number, number, number] = [-0.15, 0.16, 0.06];
const TILT_BUDAPEST: [number, number, number] = [-0.2, 0.05, 0.05];
const TILT_ARCHES: [number, number, number] = [-0.18, 0.3, -0.05];

/**
 * PortraitFrame is authored 1.02 × 1.24 world units, and nothing between it
 * and the world carries a scale (unitPose is position + rotation, ShelfUnit's
 * children slot is `<group position={[0, SHELF.top, 0]}>`, PhotoMount is a
 * base position), so that IS its world size. At the shelf family's 2.00 units
 * per metre — the rate objects.tsx pins to a Polaroid 600 print, 0.176 u =
 * 0.088 m — the frame is 0.510 × 0.620 m: a 20.1 × 24.4 inch frame around a
 * 16.9 × 21.3 inch print. That is a wall-hung artwork standing on a bookshelf.
 *
 * The clinching measurement is the bookcase's own bay: the lower plank's top
 * face is −0.6925 and the top plank's underside is −0.035, so a shelf here has
 * 0.6575 u (0.329 m) of clear headroom. The frame stood 1.89× that. It could
 * not physically have been placed on the shelf below the one it sits on.
 *
 * 0.65 lands it at 0.332 × 0.403 m — a 13.1 × 15.9 inch frame around an
 * 11.0 × 13.8 inch print, which is a real portrait frame at the large end of
 * what people stand on shelves. It stays the hero by a wide margin: 4.6× a
 * Polaroid's height, 1.6× the widest DeskFrame in the world, 1.55× a hardcover
 * (0.52 u) and 1.27× the globe's width beside it, where it had been 2.38× and
 * 1.96×. Shrinking only relaxes the globe-slot constraint documented below —
 * the portrait's left edge retreats from −1.06 to −0.88, leaving air rather
 * than taking any.
 */
const PORTRAIT_SCALE = 0.65;

/**
 * The reading COUCH — the owner picked it himself over the lounge chair it
 * replaces ("I prefer this chair over what we currently have") — and its size
 * is the one number in this file that is a compromise rather than an answer.
 *
 * The room is 2.00 world units per metre throughout. Everything standing ON a
 * shelf was already drawn at that (the book primitives pin it on eight axes)
 * while everything on the FLOOR was drawn at ~0.96, and the bookcase settles
 * which of the two is real three ways over: its bay pitch is 0.7275 units and
 * its clear headroom 0.6575, which are 0.36 m and 0.33 m at 2.00 (a bookshelf)
 * and 0.76 m and 0.68 m at 0.96 (not one); and its planks are 0.6–0.85 deep,
 * which is 0.30–0.43 m at 2.00 and 0.63–0.89 m at 0.96, i.e. a wardrobe. So
 * the case is a 1.60 × 0.575 m low unit and the floor family was half size.
 *
 * couch.glb is 2.8855 × 1.9100 × 2.2035. A 1.50 m two-seater wants 1.04 and a
 * 0.80 m back wants 0.42; the model is squarer in plan than a real loveseat,
 * so neither target is reachable alone. What actually decides it is the FLOOR
 * SLOT, and the slot is a world-layout number, not a prop one: units sit 4.4
 * apart and each case is 3.2 wide, so there is 1.2 units — 0.60 m — of floor
 * between any two cases, and on this unit the usable run is the 1.07 between
 * the plank's end at −1.60 and the frame's left edge at −2.69 (this camera
 * holds 267.5 px per unit at the couch's depth on a 1440 × 900 window). No
 * couch fits in 0.53 m of floor.
 *
 * 0.72 is where two things meet. It stands 1.375 world = 0.69 m at the back
 * and 2.078 = 1.04 m across, so it is a small two-seater rather than a
 * doll's-house one, and it is TALLER than the top plank (0.260 against 0.035),
 * which is what a couch beside a 0.575 m console actually is. It runs off the
 * left of the frame by about half its width, and that is deliberate: a couch
 * cut by the edge of the first unit reads as a room continuing, where a couch
 * shrunk to fit reads as a toy. The alternative is to change the room — widen
 * UNIT_SPACING in scene/worldLayout.ts or pull the camera back — which is not
 * this file's to do and is the owner's call.
 *
 * The yaw comes off entirely (own −0.10 cancels the unit's +0.10, so the couch
 * is square to the world). It is not styling: the couch is 2.08 × 1.59 in plan
 * and every 0.1 rad of yaw costs about 0.16 of the 1.07 the slot has. Square
 * is also what a couch pushed back against a wall does.
 *
 * The upholstery tint is load-bearing and not decoration. The desktop rail's
 * labels cross screen x 28…167 on this unit, which is world x −2.59…−2.07 —
 * the middle of the couch — and 14 px type over the old mid-tone orange
 * armchair measured 2.77:1 against a 3:1 AA floor, the worst seven cells in
 * the room. A pale oatmeal upholstery in the light theme puts a light backdrop
 * under dark type and takes that well past AA without anyone having to paint a
 * panel behind the nav. Dark theme already passed at 6.56 and keeps a deep
 * brown.
 *
 * SEAT_POSE in scene/seated.ts is still measured against the old chair's hull,
 * so sitting down lands the camera in the wrong place until its owner
 * re-measures. That is known and not a bug here. The couch stays INSIDE the
 * existing <SitChair> wrapper with its `egg:chair` hover slot untouched —
 * lifting the model out of it kills the whole Washington vista silently.
 */
const COUCH_SCALE = 0.72;
const COUCH_X = -2.659;
const COUCH_YAW = -0.1;

export default function UnitAbout({
  palette,
  dark,
  index,
  coverWidth,
}: UnitProps) {
  const textured = useUnitLod(index);
  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
        <group>
          <group position={[-0.65, 0, 0]}>
            {/* Egg: the lamp clicks off and back on. */}
            <EggLamp unitIndex={index} palette={palette} dark={dark} yaw={0.55} />
          </group>
          <BookPile palette={palette} x={0.72} salt={9} linkUnit={index} />
          {/* Apple desk object in the gap between the lamp and the family
              frame. It belongs on THIS unit and not on Projects: the bio in
              the placard beside it is the only text in the world that says
              Apple, Vision Pro, Apple Intelligence, so here the prop is a
              footnote to a sentence a reader can actually see, and on the
              Projects shelf (personal apps, none of them Apple's) it would
              be an unexplained logo. Square to the plank rather than to the
              camera (so no rotation of its own): the mark's face is the one
              near-mirror in the scene, and off-square it swings away from
              the environment probe's lit half and goes black. */}
          <group position={[-0.35, 0, 0.16]}>
            <DeskApple palette={palette} unitIndex={index} />
          </group>
          {/* Same 2.1 as its twin on Musings — mug.glb is really a pen-and-
              scissors caddy whose bbox top is the scissor tips, not the cup
              rim, so the unscaled prop was reading as an egg cup.
              Moved 0.86 → 0.16, and the book pile 0.5 → 0.62 to open the
              slot. The old spot was written against "x > ~1.1 hides behind
              the desktop placard", which is measurably wrong: the panel is
              528px at ≥1280 and the camera pans ±0.49, so the real threshold
              is x ≤ +0.85 safe / +1.3 invisible. At 0.86 the caddy spanned
              0.749..0.967 and was entirely behind the glass — the whole
              point of resizing it is that the scissors READ, and they cannot
              read through a blurred panel. */}
          {/* Pick-up-able, like its twin on Musings. Same GLB, same 2.1, and
              until now one of them answered a drag and the other was inert,
              so the same object behaved two ways depending on which shelf you
              were standing at. No new verb, just consistency. */}
          <Grabbable
            unitIndex={index}
            hoverKey="grab:mug:about"
            base={[0.35, 0, 0.05]}
            shadeColor={palette.shadow}
            shadeWidth={0.32}
          >
            <React.Suspense fallback={null}>
              <ModelProp url="/models/mug.glb" dark={dark} rotation={[0, -0.4, 0]} scale={2.1} />
            </React.Suspense>
          </Grabbable>
          {/* The four brothers, and the whole family at Christmas — the left
              flank of this shelf was empty in every screenshot he sent. */}
          <PhotoMount
            unitIndex={index}
            id="about-brothers"
            position={[-1.3, polaroidSeat(TILT_BROTHERS), 0.06]}
            rotation={TILT_BROTHERS}
          >
            <Polaroid
              src="/images/stacks/about-brothers.jpg"
              palette={palette}
              textured={textured}
              anchor="contact"
            />
          </PhotoMount>
          <PhotoMount
            unitIndex={index}
            id="about-holidays"
            position={[-0.05, deskFrameHeight(0.2) / 2, 0.04]}
            rotation={[-0.12, -0.18, 0]}
          >
            <DeskFrame
              src="/images/stacks/about-holidays.jpg"
              palette={palette}
              textured={textured}
              width={0.27}
              height={0.2}
            />
          </PhotoMount>
        </group>
      }
    >
      {/* No rest tilt to hand over — the portrait carries its own lean
          inside the component, so it lifts and grows without straightening. */}
      <PhotoMount unitIndex={index} id="portrait" position={[-0.55, 0, 0]}>
        <group scale={PORTRAIT_SCALE}>
          <PortraitFrame
            src={proxied(PORTRAIT_SRC, coverWidth)}
            palette={palette}
            textured={textured}
          />
        </group>
      </PhotoMount>
      {/* The globe takes the left flank and the houseplant takes the globe's
          old slot. He asked for the globe bigger and out from behind the
          pictures; on the right of this shelf it can be neither. Measured:
          the four leaning prints stand at z 0.00…0.16 and the globe's front
          face was at z +0.003, so every one of them was bodily in front of
          it, covering 72% of its width from the plank up to y 0.328 — only
          the top cap of the ball cleared them, which is why it read as a dark
          blob rather than a globe. The stand and the meridian ring, the parts
          that say globe, never appeared at all.
          The left flank is the only generous slot on this unit with nothing
          standing in front of it and one the placard can never reach.
          The plant swaps into the vacated slot at 1.05 rather than 1.45: at
          z −0.29 it stands BEHIND the two polaroids (their front faces are at
          z 0.05, its front reach is 0.32), which is the only way the two can
          share that band without intersecting, and 1.05 is the largest scale
          that fits between the plank's back edge and the photographs. It
          loses its right edge to the placard below 1600px. That is the
          deliberate trade: a houseplant is the cheapest thing on this shelf
          to half-hide, and the globe was the most expensive. */}
      <group position={[0.62, 0, -0.29]}>
        <Sway unitIndex={index} amount={0.022} rate={0.44}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/potted-plant.glb"
              dark={dark}
              rotation={[0, 0.5, 0]}
              scale={1.05}
            />
          </React.Suspense>
        </Sway>
        <ContactShade
          color={palette.shadow}
          width={0.3}
          position={[0, 0.02, 0.02]}
        />
      </group>
      <group position={[0.02, 0, 0]}>
        <CardStack palette={palette} />
        <ContactShade
          color={palette.shadow}
          width={0.42}
          position={[0, 0.02, 0.02]}
        />
      </group>
      {/* Polaroid pair leaning by the cards — the beach at sunset and the
          four brothers (audit §5 ★ picks). The contact height is derived from
          the tilt rather than written down; see the TILT_* note above.
          SPACING (H2): 0.45/0.63 → 0.22/0.42, and the card stack 0.25 → 0.02.
          The readable width of this shelf is −1.55…+0.43 (the desktop placard
          takes everything past +0.427 on a 1280 window) and the run had a
          0.38-wide hole between the portrait's right edge and the cards while
          the last print and the houseplant sat in or behind the panel. The
          five objects now step across it at roughly even pitch: globe −1.35,
          portrait −0.55, cards +0.02, beach +0.22, brothers +0.42, plant
          +0.62 — the plant keeps the one slot it is cheap to half-hide. */}
      <PhotoMount
        unitIndex={index}
        id="beach-sunset"
        position={[0.22, polaroidSeat(TILT_BEACH), 0.1]}
        rotation={TILT_BEACH}
      >
        <Polaroid
          src="/images/stacks/beach-sunset.jpg"
          palette={palette}
          textured={textured}
          anchor="contact"
        />
      </PhotoMount>
      <PhotoMount
        unitIndex={index}
        id="bros"
        position={[0.42, polaroidSeat(TILT_BROS), 0.17]}
        rotation={TILT_BROS}
      >
        <Polaroid
          src="/images/stacks/bros.jpg"
          palette={palette}
          textured={textured}
          anchor="contact"
        />
      </PhotoMount>
      {/* Egg: one slow damped revolution per click, over a continuous idle
          drift — a globe that never moves is the most obviously stopped
          object a room can contain. One turn per ~105s: slow enough that you
          notice it the second time you look, which is the right speed for
          something sitting on a shelf. The spin wrapper sits AT the globe's
          slot so the turn is about its own stand, not the unit. */}
      {/* Left flank, and 1.5 → 2.0. The measured comment this replaces was
          wrong twice over and worth correcting rather than deleting: the
          camera holds the world at 262.3 px/unit on an EVEN unit (239.6 is
          the odd-unit figure — odd units sit at z −0.55), so the placard's
          fixed 528px inset puts the visible edge at (viewportWidth/2 − 528) /
          262.3 = +0.427 at 1280, +0.732 at 1440, +1.037 at 1600. The globe at
          0.70 was NOT "whole from 1440 up": it spanned 0.506…0.896 and a
          third of it was under the glass at 1440.
          2.0 is the slot's ceiling, not a taste call. The globe's box is
          0.2603 wide per unit of scale, the slot runs from the plank end
          −1.6345 to the portrait's left edge −1.0694, and at 2.0 it lands at
          −1.610…−1.088: 0.024 of air at the plank end and 0.020 at the frame.
          That is +33% linear and +78% on screen over the old size, and it is
          unoccluded at every viewport width, which the metrically correct 2.6
          would not be at any position on this shelf.
          The postcards are CHILDREN of this group rather than siblings at
          absolute coordinates. They lean on the stand, so that relationship
          is structural: move the globe and they come with it. Their offsets
          are re-measured for the bigger ball — at the old offsets they were
          inside it — and they now sit clear in FRONT of it, at 0.28 and 0.30
          against its 0.184 front face. They FLANK it rather than stack in
          front of it: at ±0.17 they leave a 0.12 gap on the centre line, and
          the centre line is where the stand and the meridian ring are. Put
          them any closer together and the globe is a ball on a shelf again,
          which is the whole complaint.
          The move also fixes them being unclickable: behind the polaroids
          they were the only two PhotoMounts in the world that no pointer
          could reach at any viewport width. */}
      <group position={[-1.35, 0, 0.02]}>
        <SpinProp unitIndex={index} hoverKey="egg:globe" idleRate={0.06}>
          <React.Suspense fallback={null}>
            {/* spinPart isolates the ball so SpinProp turns it inside the
                stand and meridian ring rather than revolving the whole prop
                like a turntable. */}
            <ModelProp url="/models/globe.glb" dark={dark} rotation={[0, -0.7, 0]} scale={2.0} spinPart="sphere" />
          </React.Suspense>
        </SpinProp>
        <ContactShade
          color={palette.shadow}
          width={0.42}
          position={[0, 0.02, 0.04]}
        />
        {/* Budapest Parliament + Delicate Arch (the Instagram curation
            round's top travel frame). Outside SpinProp, never inside — a
            postcard that revolves with the globe is a fairground ride. */}
        <PhotoMount
          unitIndex={index}
          id="postcard-budapest"
          position={[-0.17, postcardSeat(TILT_BUDAPEST), 0.3]}
          rotation={TILT_BUDAPEST}
        >
          <PostcardPrint
            src="/images/stacks/postcard-budapest.jpg"
            palette={palette}
            textured={textured}
            anchor="contact"
          />
        </PhotoMount>
        {/* Arches is migrated with its twin even though the detector had not
            flagged it: it carried the same stale 0.0735 and was sunk 2.2 cm,
            but its bounding box overlaps the globe's stand so the support
            search nominated the stand instead of the plank and measured the
            gap from the wrong surface. Fixing one postcard and not the other
            would have stood two identical prints at visibly different heights
            a hand's width apart. */}
        <PhotoMount
          unitIndex={index}
          id="postcard-arches"
          position={[0.16, postcardSeat(TILT_ARCHES), 0.28]}
          rotation={TILT_ARCHES}
        >
          <PostcardPrint
            src="/images/stacks/postcard-arches.jpg"
            palette={palette}
            textured={textured}
            anchor="contact"
          />
        </PhotoMount>
      </group>
      </ShelfUnit>
      {/* Reading couch on the ground at the LEFT flank — the room reads
          inhabited before a single word is read. See COUCH_SCALE for the size,
          the yaw, the x, and the tint, all four of which are solved rather
          than chosen.
          Click it and you sit down in it, turn around, and look out at the
          Washington skyline he grew up under. The glue is in SitChair; the
          camera easing is CameraRig's and the sky is SceneEnvironment's, and
          the three talk through scene/seated.ts rather than to each other. */}
      <group position={[COUCH_X, -1.115, 0.12]} rotation={[0, COUCH_YAW, 0]}>
        <SitChair unitIndex={index}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/couch.glb"
              dark={dark}
              variant="tinted"
              tints={{
                // Pale oatmeal in daylight so the rail's dark labels have a
                // light backdrop (see COUCH_SCALE); a deep, warm brown at
                // night, where the rail already passes and the room wants the
                // mass to sit back.
                Couch_Blue: dark ? "#4a3a2c" : "#cfc3ac",
                Black: palette.woodDark,
              }}
              scale={COUCH_SCALE}
            />
          </React.Suspense>
        </SitChair>
      </group>
      {/* The monstera goes on the FLOOR beside the chair rather than on a
          shelf: at 0.40 it still needs 0.82 of headroom and a plank gap is
          about 1.0, so anywhere under wood it is a plant in a box. On the
          ground it can run full height.
          It WAS at [−2.5, −1.115, −0.32] at 0.55 and the leaves grew through
          the chair, which is what he saw. Measured, not eyeballed: at that
          pose the plant's box was x −3.2318…−1.8025, z −0.8120…+0.6799 and
          the chair's is x −2.4914…−1.6239, z −0.1189…+0.7730 — 0.69 of
          overlap in x and 0.80 in z, i.e. bodily inside each other.
          Separating them in x is not available (the chair already sits at the
          plank's end, and the left edge of the viewport is x −2.44 at
          1280px), so the split is in DEPTH: the plant stands behind the chair.
          0.62 → 1.00 and z −1.45 → −2.00, and the two move TOGETHER because
          the second is what pays for the first. At the room's real 2.00 units
          per metre (see CHAIR_SCALE) 0.62 was a 0.63 m plant, which is a
          tabletop pot standing on a floor; 1.00 is 1.02 m, a floor monstera.
          Growing it also grows its reach: yawed −0.30 (its own −0.40 inside a
          unit yawed +0.10) the model measures 1.354 from its axis in z, so at
          the old z −1.45 its front leaves would have reached −0.096 and gone
          straight through the chair, whose back face is at −0.475. z −2.00
          puts that front face at −0.646 — 0.17 clear — and costs nothing on
          screen, because standing further from the camera is exactly what
          lets it be bigger without crowding: 2.04 units at 194.8 px per unit
          is 397 px against the 265 px it was, up 50%.
          y −1.115, the ground plane itself. This was −1.0919 on the theory
          that "the pot base sits 0.023 BELOW this model's origin", which is
          backwards — raising the origin by that 0.023 is what put the plant
          1.15 cm into the air, and it is the amount the detector reported.
          scripts/stacks-floaters.mjs settles it: `model contact y -0.0000 on
          1 island(s), 7.7% of footprint`. The pot base sits exactly AT the
          origin, on one broad island rather than a leaf tip, so the origin
          belongs on the ground and nowhere else. Re-run that script rather
          than adjusting this by eye — a bare number here cannot look wrong. */}
      <Sway unitIndex={index} amount={0.018} rate={0.31} phase={0.7}>
        <group position={[-2.72, -1.115, -2.0]} rotation={[0, -0.4, 0]}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/monstera.glb"
              dark={dark}
              variant="recolor"
              scale={1.0}
            />
          </React.Suspense>
        </group>
      </Sway>
      <FootPool
        color={palette.shadow}
        size={[0.9, 0.68]}
        position={[-2.72, -1.115, -2.0]}
      />
      <FootPool
        color={palette.shadow}
        size={[2.1, 1.6]}
        position={[COUCH_X, -1.115, 0.12]}
      />
    </group>
  );
}
