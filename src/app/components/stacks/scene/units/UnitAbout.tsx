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
          <BookPile palette={palette} x={0.62} salt={9} linkUnit={index} />
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
          <group position={[-0.42, 0, 0.15]}>
            <DeskApple palette={palette} />
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
            base={[0.16, 0, 0.05]}
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
            position={[-1.06, polaroidSeat(TILT_BROTHERS), 0.06]}
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
            position={[-0.14, deskFrameHeight(0.2) / 2, 0.04]}
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
      <group position={[0.72, 0, -0.29]}>
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
      <group position={[0.25, 0, 0]}>
        <CardStack palette={palette} />
        <ContactShade
          color={palette.shadow}
          width={0.42}
          position={[0, 0.02, 0.02]}
        />
      </group>
      {/* Polaroid pair leaning by the cards — the beach at sunset and the
          four brothers (audit §5 ★ picks). The contact height is derived from
          the tilt rather than written down; see the TILT_* note above. */}
      <PhotoMount
        unitIndex={index}
        id="beach-sunset"
        position={[0.45, polaroidSeat(TILT_BEACH), 0.1]}
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
        position={[0.63, polaroidSeat(TILT_BROS), 0.17]}
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
      {/* Reading chair on the ground at the LEFT flank, angled toward
          the unit — the room reads inhabited before a single word is read.
          x −2.08 keeps its armrest CLEAR of the full-width lower plank
          (ends at −1.6; the v4.0 spot ran the arm through it).
          The owner asked for an Eames. Said plainly: there is no Eames
          lounge chair on poly.pizza — a sweep of eames / lounge chair /
          armchair / recliner / mid century modern turned up about ninety
          chairs and not one plywood shell, leather cushion or ottoman. This
          is the nearest honest read: a 1950s Danish lounge chair, one-piece
          upholstered shell sweeping from a sloping high back into low arms,
          seat cushion a separate slab, on four splayed tapered dowel legs.
          It is a real upgrade on the club chair it replaces and it is not an
          Eames, and he should judge it knowing that. The only genuine icon
          on the site is Breuer's Wassily, which I passed on: 6,116 tris and
          392 KB of tubular steel that reads as a wire scribble at this
          scale.
          0.73 gives 0.890 world against a real 0.85 m chair, on the floor
          conversion the ladder and grandfather clock already imply — 13%
          taller than the old armchair, which is right for a high back.
          The tint is not optional: as authored the upholstery is
          0.10/0.09/0.01, i.e. near-black, and untinted it renders as a
          silhouette with no chair in it. */}
      {/* Click it and you sit down in it, turn around, and look out at the
          Washington skyline he grew up under. The glue is in SitChair; the
          camera easing is CameraRig's and the sky is SceneEnvironment's, and
          the three talk through scene/seated.ts rather than to each other. */}
      <group position={[-2.08, -1.115, 0.12]} rotation={[0, 0.55, 0]}>
        <SitChair unitIndex={index}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/eames-chair.glb"
              dark={dark}
              variant="tinted"
              // Tan leather rather than a palette spine hex: the spine reds
              // are book-cover saturation and put a salmon chair in the room.
              tints={{
                Cloth1MinimalistModernChair1: dark ? "#6d4b38" : "#9a6f52",
                WoodMinimalistModernChair1: palette.woodDark,
              }}
              scale={0.73}
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
          1280px), so the split is in DEPTH: the plant now stands behind the
          chair. The model reaches +1.29 forward of its origin at this scale,
          so z −1.45 puts its front face at −0.323, clearing the chair's back
          face by 0.20, and x −2.72 puts its right edge at −1.934, clear of
          the chair's left edge by 0.31. The boxes are disjoint on BOTH axes,
          so no leaf can pass through the upholstery at any sway phase — and
          it is still clear of the bookcase's own edge at −1.6345.
          0.55 → 0.62 comes out of the same pass: at 0.55 it stood 1.13 world
          against a 0.90 chair, which is a short plant for a floor. 0.62 is as
          far as it goes before it starts crowding the chair on screen rather
          than standing behind it.
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
        <group position={[-2.72, -1.115, -1.45]} rotation={[0, -0.4, 0]}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/monstera.glb"
              dark={dark}
              variant="recolor"
              scale={0.62}
            />
          </React.Suspense>
        </group>
      </Sway>
      <FootPool
        color={palette.shadow}
        size={[0.56, 0.42]}
        position={[-2.72, -1.115, -1.45]}
      />
      <FootPool
        color={palette.shadow}
        size={[0.62, 0.48]}
        position={[-2.08, -1.115, 0.12]}
      />
    </group>
  );
}
