"use client";

// Featured talks — framed stills warmed by the reading lamp.
//
// v5 rebuild. This was the emptiest unit in the world and it was not close:
// five placements against About's fifteen, four of them photographs, and one
// GLB in the whole unit. A gallery wall with a lamp on it. Worse, the frame
// row restates the placard's three cards one-for-one directly beside them, so
// half the unit's visual weight was a duplicate of the panel next to it.
//
// Three structural problems, fixed here:
//
// 1. Frame 3 was half behind the desktop placard. FrameRow sat at local x 0
//    with width 2.6, so the frames landed at −0.87 / 0 / +0.87 and the third
//    spanned 0.49…1.25. The panel is 464px wide below the xl breakpoint and
//    528px above it, and the camera pans ±0.49 world units with the pointer:
//    x ≤ +0.85 is safe on desktop, x ≥ +1.3 is invisible. UnitBooks already
//    hit this and fixed it by hand; Talks never got the same treatment. The
//    row now sits at −0.25.
// 2. The entire front ledge of the upper shelf — z 0…+0.42 across 3.2 of
//    plank — was empty. It is the largest unused surface in the world. The
//    tent card and the fireside frame stand on it, in front of the row,
//    which is also what stops the row reading as thumbnails pasted on wood.
// 3. Nothing on the ground. Every unit that reads as furnished has a floor
//    prop and every unit that reads thin does not. The floor lamp is the
//    change that most moves this unit from "wall" to "room", and it earns
//    its place twice over: a second lamp silhouette was wanted anyway.
import { useStacks } from "../../store";
import { proxied } from "../../theme";
import { ContactShade, FootPool } from "../GroundPool";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { EggLamp, EggTrigger, LampSwitch } from "../eggs";
import { HoverProp } from "../links";
import { Polaroid, polaroidSeat } from "../objects";
import { DeskFrame, PhotoMount, deskFrameHeight } from "../photos";
import { FrameRow, GlowSprite, ShelfUnit } from "../primitives";
import { ConferenceBadge, TentCard } from "../speaking";
import { useUnitLod } from "../useUnitLod";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useMemo, useRef } from "react";
import * as THREE from "three";

import { type UnitProps } from "./types";

/** Floor lamp, measured from lamp-floor.glb by material island rather than
 * eyeballed: the `lamp` shade runs y 0.6815…0.8600 with a 0.0878 mouth at the
 * bottom and a 0.0623 opening at the top; `metal` is the pole and base, y
 * 0…0.7607. Everything the light rig needs is those numbers times the scale,
 * so resizing the lamp cannot tear the rig off the shade — which is exactly
 * the trap the desk lamp is still sitting in, its MOUTH constants being
 * unscaled model space in a sibling of the ModelProp.
 *
 * 1.67 → 3.03 (owner: "the ladder and lamp still look significantly too
 * small"). The note this replaces reasoned inside a FLOOR family drawn at
 * ~0.96 units per metre, and that family was the error: the bookcase's own
 * joinery puts the room at 2.00 u/m — bay pitch 0.7275 (0.36 m), clear
 * headroom 0.6575 (0.33 m), plank depth 0.6 (0.30 m), all three a bookshelf
 * at 2.00 and none of them furniture at 0.96 — so the case is a 1.60 × 0.575 m
 * low unit and everything standing on the floor beside it was half size. At
 * 1.67 this was a 0.72 m lamp.
 *
 * 2.85 stands it 2.451 world = 1.23 m, and it is set by the FRAME rather than
 * by the metre: the top of the window is world y ~1.56 (measured off a
 * rendered frame — the plank at 0.035 lands at py 425 and the floor at py 745,
 * so this camera holds ~278 px per unit), and a real 1.50 m lamp at 3.49 would
 * push the shade — the only part of a lamp worth looking at — clean out of it.
 * 2.85 tops out at 1.336, which keeps sky above the shade at every pointer
 * position.
 *
 * The clock across the room moved in the same pass to the same real height:
 * 1.23 m of lamp beside a 1.23 m clock case. Both are capped by the same
 * window and both are honestly short of the object they depict — see the
 * report.
 *
 * Every world-space number that is NOT a child of the scaled ModelProp has to
 * move with it — light `distance` is a falloff radius in world units and a
 * parent scale does not touch it, and neither the glow sprites nor the ground
 * pools are children either. All of them are × 1.707 (2.85/1.67) below, and
 * the intensities are deliberately NOT: the lamp gets bigger, not brighter,
 * which is the same rule LampGlow's `reach` follows. */
const LAMP_S = 2.85;
const SHADE_BOTTOM_Y = 0.6815 * LAMP_S;
const SHADE_TOP_Y = 0.86 * LAMP_S;
const SHADE_BOTTOM_R = 0.0878 * LAMP_S;
const SHADE_TOP_R = 0.0623 * LAMP_S;

/** The vertical ramp painted onto the shade fabric — see ShadeFabric.
 *
 * v=0 is the BOTTOM ring of a cylinder's UV and CanvasTexture flips Y, so the
 * gradient is written from canvas-bottom upward and the stops read
 * bottom-rim → top-rim. Four pixels wide because nothing varies around the
 * circumference; the whole texture is 4 × 128. */
let fabricTextureCache: THREE.CanvasTexture | null = null;
function fabricTexture(): THREE.CanvasTexture {
  if (fabricTextureCache) return fabricTextureCache;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, h, 0, 0);
  // Peak just below mid-height (a floor-lamp bulb sits low in its shade),
  // arriving at BOTH rims with a near-zero derivative — the same reason
  // GlowSprite's halo traces a gaussian. A ramp that stops abruptly at a rim
  // draws a line there, and a line on a lampshade is a seam, not light.
  for (const [stop, a] of [
    [0, 0.05], [0.1, 0.28], [0.24, 0.68], [0.42, 1],
    [0.58, 0.86], [0.76, 0.44], [0.9, 0.15], [1, 0.02],
  ] as const) {
    grad.addColorStop(stop, `rgba(255, 201, 138, ${a})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, h);
  fabricTextureCache = new THREE.CanvasTexture(canvas);
  return fabricTextureCache;
}

/** A lit lampshade is TRANSLUCENT. The GLB's shade is one flat opaque island
 * of `lamp`-material yellow, which is why it read as painted plastic however
 * much glow was piled around it — the owner's "the lighting on this isn't at
 * all right".
 *
 * ModelProp's `tinted` variant only remaps `material.color`, so there is no
 * way to make the GLB's own fabric emit from a call site. This is the call-
 * site answer: a second cone, 3% proud of the measured shade, carrying an
 * additive vertical ramp. Brightest where the bulb is, falling to nothing at
 * both rims, so the fabric glows from within instead of being filled flat.
 *
 * Deliberately toneMapped (i.e. NOT `toneMapped={false}` like the mouth disc):
 * an additive layer this large held above the ACES shoulder is exactly what
 * blows out once the composer mounts and Bloom compounds it. Graded with the
 * room it stays a lit shade in both themes.
 *
 * FrontSide, and the back half is depth-tested away by the opaque GLB shade
 * it wraps — so the silhouette never doubles up.
 *
 * The radius is INSIDE the measured shade (0.975) and the material wins the
 * depth test with a polygon offset instead of by standing proud, which is the
 * one non-obvious thing here. Standing proud was tried first, at 1.03 and then
 * 1.06, and both drew a hard pale outline all the way round the lamp: the
 * band of cone hanging past the GLB's silhouette lands on the SKY, and warm
 * additive over a night sky is grey while over a morning sky it is white. The
 * halo the owner objected to, re-drawn as a rectangle. Sitting inside costs a
 * ~1px unlit rim of real shade at the edge — which is what the edge of fabric
 * looks like anyway — and costs nothing over the sky, which is the point.
 * 0.975 rather than a hair inside because the GLB shade is a coarse polygon:
 * its silhouette pulls in to ~0.98 of the circumscribed radius at each facet
 * midpoint, and a smooth 24-gon at 0.99 would poke back out through those.
 *
 * The composer halving is GlowSprite's, for GlowSprite's reason: additive
 * light compounds in the linear HDR target and Bloom then earns a second pass
 * over it. Milder than the sprite's 0.45 because this layer IS tone-mapped and
 * so arrives at the composer already on the shoulder. */
function ShadeFabric({ dark }: { dark: boolean }) {
  const texture = useMemo(() => fabricTexture(), []);
  const postfx = useStacks((s) => s.postfx);
  return (
    <mesh position={[0, (SHADE_BOTTOM_Y + SHADE_TOP_Y) / 2, 0]}>
      <cylinderGeometry
        args={[
          SHADE_TOP_R * 0.975,
          SHADE_BOTTOM_R * 0.975,
          (SHADE_TOP_Y - SHADE_BOTTOM_Y) * 0.985,
          24,
          1,
          true,
        ]}
      />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={(dark ? 0.62 : 0.98) * (postfx ? 0.65 : 1)}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}

/**
 * Which still the SHELF shows for a talk, keyed by videoId. Owner, of the
 * three framed stills: "this is basically the same photo 3 times. please fix".
 *
 * He was looking at a real thing. The archive holds one Consensus moment —
 * him and the CoinDesk host in two chairs against a teal wall — and it had
 * been cropped three ways and hung three times on one shelf: the YouTube
 * thumbnail in frame 1, `talk-consensus.jpg` in frame 2 (an override in
 * page.tsx, put there because talk 2's OWN thumbnail is a photograph of a
 * projected slide), and `talk-fireside-wide.jpg` in the small frame standing
 * in front of them. Three sizes of one picture.
 *
 * Frame 2 is the one that has to move, because it is the only one showing an
 * event it does not belong to. `talk-summit.jpg` is the right still for it on
 * the merits and not just for variety: the talk is "What Really Is The AI
 * Collective?" and the photograph is him on the mic in the Collective's own
 * orange organiser vest. It is also the only image in the set that is not a
 * dark stage — an indoor, daylit, three-figure composition — so the row now
 * reads as three different rooms at a glance.
 *
 * That frees nothing on the shelf, so the leaning print at the far left takes
 * `talk-consensus-alt.jpg` instead: same event as frame 1, a genuinely
 * different frame (him alone, plain light-teal wall, no second person), and
 * it lives 1.6 units away from it.
 *
 * This supersedes `SCENE_TALK_STILLS` in src/app/page.tsx for videoId
 * 5Pl0nqh7ZLU. That entry is now dead and should be deleted — see the report;
 * page.tsx is not this change's to edit.
 *
 * Honest residual: the archive has four genuinely distinct talk photographs
 * (Consensus, the Collective vests ×2, the AI Summit panel) for seven picture
 * slots on this unit, so frame 1 and the small front frame are still two crops
 * of one moment. They are at opposite ends of the shelf and at very different
 * sizes; the fix for the rest is more photographs, not more code.
 */
const SHELF_STILL: Record<string, string> = {
  "5Pl0nqh7ZLU": "/images/stacks/talk-summit.jpg",
};

/** Each lean is declared once because it is used twice — as the mount's
 * rotation and as the input to polaroidSeat. A lean typed into one and not the
 * other is the exact bug this scene has regrown four times. */
const SUMMIT_LEAN: [number, number, number] = [-0.15, 0.1, -0.05];
const MIC_LEAN: [number, number, number] = [-0.15, -0.14, 0.04];

/** Turn it over. A badge is the one object on a shelf you physically flip,
 * and this component already models both faces — the printed card and the
 * blank stock behind it — so the back is there waiting to be seen.
 *
 * SpinProp is the near-miss: it adds a full 2π per click, which on a badge
 * reads as a turntable rather than a hand. This adds π, so the first click
 * shows you the back and the second brings the name home. */
function FlipProp({
  unitIndex,
  hoverKey,
  children,
}: {
  unitIndex: number;
  hoverKey: string;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const target = useRef(0);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g || g.rotation.y === target.current) return;
    const next = THREE.MathUtils.damp(g.rotation.y, target.current, 3.4, delta);
    g.rotation.y =
      Math.abs(next - target.current) < 1e-3 ? target.current : next;
  });
  return (
    <EggTrigger
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      onTrigger={() => {
        if (
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          return;
        }
        target.current += Math.PI;
      }}
    >
      <group ref={ref}>{children}</group>
    </EggTrigger>
  );
}

export default function UnitTalks({
  data,
  palette,
  dark,
  index,
  coverWidth,
  onOpenUrl,
}: UnitProps) {
  const textured = useUnitLod(index);
  /** Shared 0..1 lit factor for the floor lamp: the switch damps it and the
   * two glow sprites multiply it in themselves. */
  const lit = useRef(1);
  const frames = useMemo(
    () =>
      data.talks.map((talk) => ({
        src: proxied(SHELF_STILL[talk.videoId] ?? talk.still, coverWidth),
        key: talk.url,
      })),
    [data.talks, coverWidth],
  );
  return (
    <>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            {/* 0.55 → 0.62. The lamp is now scaled to 1.49 (it was rendering
                at half the size of a real one), and at 0.55 its wider base
                closed to 0.020 of the badge. Moving the lamp rather than the
                badge, because the lamp is what grew. 0.62 spans 0.503…0.700,
                still well inside the +0.85 safe band. */}
            <group position={[0.62, 0, 0]}>
              {/* Egg: the lamp clicks off and back on. */}
              <EggLamp
                unitIndex={index}
                palette={palette}
                dark={dark}
                yaw={-0.5}
              />
            </group>
            {/* Consensus, him alone against the plain teal wall — the other
                frame from that morning, and NOT the two-chair shot the row
                above already carries at full size. See SHELF_STILL: the vest
                photograph that used to lean here has gone into frame 2, where
                it is the still for the talk it was actually taken at.
                −1.12 → −1.30 uses the plank end the shelf was leaving bare. */}
            {/* Anchored at the contact edge and seated by polaroidSeat rather
                than the old literal 0.1555, which stood the print 2.21 cm off
                the wood: a centred board hangs its lowest corner below
                wherever the caller puts it, by an amount that depends on the
                lean, so every leaning print in the world floated by its own
                private number.
                The explicit size={0.176} went with it. It was set to match a
                real 88 × 107 mm Polaroid 600 after the same object had been
                drawn at four sizes across the world — and POLAROID_SIZE is now
                that number, so passing it again only creates a second copy to
                drift out of step with the seat. */}
            <PhotoMount
              unitIndex={index}
              id="talk-consensus-alt"
              position={[-1.3, polaroidSeat(SUMMIT_LEAN), 0.05]}
              rotation={SUMMIT_LEAN}
            >
              <Polaroid
                src="/images/stacks/talk-consensus-alt.jpg"
                palette={palette}
                textured={textured}
                anchor="contact"
              />
            </PhotoMount>
            {/* Mic in hand, arm up, GenAI Collective banners behind — him
                HOSTING, a different register from the polished stage shoot.
                It links: this one came off a tweet, and the id survived
                verbatim in the archived filename. */}
            {/* Same migration as talk-summit: contact anchor + polaroidSeat,
                replacing a literal 0.1425 that floated it 1.57 cm. */}
            <PhotoMount
              unitIndex={index}
              id="talk-mic"
              position={[0.06, polaroidSeat(MIC_LEAN), 0.14]}
              rotation={MIC_LEAN}
              href="https://x.com/i/status/1798370655718744491"
            >
              <Polaroid
                src="/images/stacks/talk-mic.jpg"
                palette={palette}
                textured={textured}
                anchor="contact"
              />
            </PhotoMount>
            {/* Framed Stanford panel shot fills the dead zone left of the
                lamp — the stand mic read "stupid and out of place" (owner, at
                browse); a real stage moment does the same narrative work.
                −0.50 → −0.72 (H2): with the leaning print moved out to the
                plank end this frame left a 0.42-wide hole between them, the
                largest bare run on the unit. At −0.72 it spans −1.01…−0.43,
                which is 0.20 off the print and 0.28 off the instant print on
                its right. */}
            <PhotoMount
              unitIndex={index}
              id="talk-stanford"
              position={[-0.72, 0.224, 0]}
              rotation={[-0.1, 0.12, 0]}
            >
              <RoundedBox
                castShadow
                args={[0.58, 0.44, 0.03]}
                radius={0.008}
                smoothness={4}
                position={[0, 0, -0.018]}
              >
                <meshStandardMaterial color={palette.frame} roughness={0.6} />
              </RoundedBox>
              {textured && (
                <React.Suspense fallback={null}>
                  <LitImage
                    url="/images/stacks/talk-stanford.jpg"
                    width={0.52}
                    height={0.38}
                    roughness={0.5}
                    position={[0, 0, -0.001]}
                  />
                </React.Suspense>
              )}
            </PhotoMount>
            {/* The badge you come home with, lanyard coiled beside it. The
                only object in the unit that is residue rather than record —
                everything else here is a picture OF a talk. Under the lamp's
                pool, in the gap the lamp left on its right. */}
            {/* Egg: click and it turns over to the blank card stock, click
                again and the name comes back. */}
            <group position={[0.38, 0, 0.12]} rotation={[0, -0.35, 0]}>
              <FlipProp unitIndex={index} hoverKey={`egg:badge:${index}`}>
                <ConferenceBadge
                  palette={palette}
                  venue="CONSENSUS"
                  cordColor={palette.spines[3] ?? palette.ink}
                />
              </FlipProp>
            </group>
          </group>
        }
      >
        <group position={[-0.25, 0, 0]}>
          <FrameRow
            frames={frames}
            width={2.6}
            palette={palette}
            textured={textured}
            unitIndex={index}
            onFrameClick={onOpenUrl}
          />
        </group>
        {/* The panel table's name card, standing on the front ledge and
            overlapping the bottom of the first frame. The overlap is the
            point: the row's problem was that it reads as a flat plane of
            thumbnails, and one small object standing in front of it is the
            cheapest way to break that. */}
        {/* 0.28 → 0.42 wide. A table tent card is 0.21 m across, which is
            0.42 here; at 0.28 it was a 0.14 m card, small enough that the
            name on it was never going to resolve. Height rides along at the
            same 1.5 so the printed face is not stretched.
            The 0.24 yaw moved OUT of this group and into the hover's `rest`,
            because a tilt applied outside the lift is out of the hover's
            reach. Hover now eases the full 0.24 away and the card turns
            square to you, which is the angle its type is legible at — the
            fixed yaw was exactly the angle that kept it illegible. */}
        <group position={[-1.0, 0, 0.3]}>
          <HoverProp
            unitIndex={index}
            hoverKey="hover:tentcard"
            lift={[0, 0.008, 0.014]}
            rest={[0, 0.24, 0]}
            settle={0.24}
            grow={1.05}
          >
            <TentCard palette={palette} width={0.42} height={0.255} />
          </HoverProp>
        </group>
        {/* A vocal mic on its desk stand, on the front ledge between the name
            card and the fireside frame. The unit's own header calls that ledge
            the largest unused surface in the world, and this is the object it
            was always missing: everything else here is a picture OF a talk,
            and a mic is the thing you actually stand behind.
            NOT the v4 stand mic the owner killed at browse — that was a
            full-height floor stand next to a bookcase, which is why it read as
            out of place. microphone.glb is 11.1418 tall, and a real desk mic
            on its stand is about 0.25 m, so at the room's 2.00 world units per
            metre the scale is 0.50 / 11.1418 = 0.0449 and it stands 0.50 world
            — a hand's length, the same order as the tent card beside it.
            Single greyscale material, so the tint just multiplies it. */}
        <group position={[-0.52, 0, 0.3]} rotation={[0, 0.22, 0]}>
          <HoverProp
            unitIndex={index}
            hoverKey="hover:mic"
            lift={[0, 0.01, 0.014]}
          >
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/microphone.glb"
                dark={dark}
                variant="tinted"
                tints={{ lambert2SG: palette.metal }}
                scale={0.0449}
              />
            </React.Suspense>
          </HoverProp>
          <ContactShade
            color={palette.shadow}
            width={0.24}
            position={[0, 0.02, 0.02]}
          />
        </group>
        {/* The one Talks photograph the repo processed and never placed. It
            earns a seventh image on three counts: it is the only WIDE
            silhouette among three tall frames and three square prints, the
            only one showing a conversation rather than him addressing a
            room, and it stands 0.33 forward of the row, which is the
            front-to-back depth this unit had none of. */}
        <PhotoMount
          unitIndex={index}
          id="talk-fireside-wide"
          position={[0.26, deskFrameHeight(0.236) / 2, 0.27]}
          rotation={[-0.08, -0.18, 0.02]}
        >
          <DeskFrame
            src="/images/stacks/talk-fireside-wide.jpg"
            palette={palette}
            textured={textured}
            width={0.42}
            height={0.236}
          />
        </PhotoMount>
      </ShelfUnit>
      {/* Floor lamp at the left flank, clear of the lower plank (which ends
          at −1.6). See LAMP_S for why it is 1.67 and not the 1.95 that stood
          it taller than a grandfather clock.
          Egg: it clicks off and back on, like both desk lamps. The room has
          three lamps and until now only two of them answered. The trigger
          wraps the pole and shade ONLY — every emissive disc, glow sprite and
          ground pool is a sibling in the rig, because an additive sprite is a
          metre-wide transparent quad and inside the trigger it becomes an
          invisible hit box over half the unit. */}
      <group position={[-1.98, -1.115, 0.06]} rotation={[0, 0.45, 0]}>
        <LampSwitch
          unitIndex={index}
          hoverKey={`egg:lamp:floor:${index}`}
          litRef={lit}
          rig={
            <>
              {/* Light has to LEAVE a shade, out of both ends, or the lamp is a
            painted cone on a stick. Measured rather than guessed: parsing the
            GLB by material puts the shade's `lamp` island at y 0.6815 to
            0.8600, a truncated cone with a 0.0878 mouth at the bottom and a
            0.0623 opening at the top. Everything below is those two numbers
            times the scale, so the rig cannot drift if the lamp is resized.

            v5.1 — the owner's "the lighting on this isn't at all right".
            Three named faults, three fixes:

            1. TWO detached orange orbs, one in the sky above the shade and one
               on the pole below it. Both were GlowSprites sized to the BAY
               rather than to the shade: 0.53 and 0.34 against a mouth that is
               0.293 across, floated 0.111 and 0.086 clear of the rims. A halo
               wider than the thing making it and standing off it is not light,
               it is a ball. They are now 0.26 and 0.155 — each NARROWER than
               the opening it belongs to — and pulled in to 0.032 and 0.014 of
               the rim, so what you see is spill leaving a mouth.
            2. The shade was a flat, uniformly opaque yellow trapezoid, which is
               the whole "painted plastic" read — see ShadeFabric.
            3. White specks on both rims: these two emissive discs, seen at a
               graze. The camera sits at y 0.25 and the mouth at 0.023, so the
               bottom disc is 6.5° off edge-on; the TOP opening is at 0.321,
               ABOVE the camera, so that disc was 4° off edge-on from
               underneath and could never be anything but three white pixels.
               The top disc is gone. The bottom one stays — it is the only
               thing in the rig that is visibly the SOURCE — but at 1.9/1.0
               rather than 3.2/1.6, which keeps it over Bloom's 0.95 threshold
               (emissive #ffc98a is luminance 0.83, so ×1.9 = 1.6) while
               landing amber instead of clipped white. */}
              <mesh
                position={[0, SHADE_BOTTOM_Y, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <circleGeometry args={[SHADE_BOTTOM_R * 0.88, 24]} />
                <meshStandardMaterial
                  color="#ffe6bd"
                  emissive="#ffc98a"
                  emissiveIntensity={dark ? 1.9 : 1.0}
                  roughness={0.4}
                  side={THREE.DoubleSide}
                  toneMapped={false}
                />
              </mesh>
              {/* The fabric itself, lit from inside. */}
              <ShadeFabric dark={dark} />
              {/* What you actually SEE of a floor lamp from eye level is the
                  air just below the mouth and just above the top opening, so
                  those get camera-facing glows — sized UNDER the opening they
                  leave and hugging it. Both sprites read the switch's lit
                  factor themselves, because the traverse skips sprites:
                  GlowSprite writes its own opacity every frame. */}
              <group position={[0, SHADE_BOTTOM_Y - 0.055, 0]}>
                <GlowSprite
                  opacity={palette.glowOpacity * 0.85}
                  eased
                  scale={0.444}
                  factorRef={lit}
                />
              </group>
              <group position={[0, SHADE_TOP_Y + 0.024, 0]}>
                <GlowSprite
                  opacity={palette.glowOpacity * 0.5}
                  eased
                  scale={0.264}
                  factorRef={lit}
                />
              </group>
              {/* And a real spot down the mouth, so anything that does pass
                  under it is genuinely lit rather than merely near a glow.
                  `distance` is a world-space falloff radius and the parent
                  scale does not touch it, so all three distances came down
                  with the lamp (× 0.856). */}
              <spotLight
position={[0, SHADE_BOTTOM_Y - 0.017, 0]}
                color="#ffbe73"
                intensity={dark ? 7.4 : 3.0}
                angle={0.85}
                penumbra={0.9}
                distance={3.81}
                decay={2}
              />
              {/* Up out of the top opening — a drum shade throws as much light
                  at the ceiling as at the floor, and without it the top of the
                  lamp is a dark rim above a lit cone. */}
              <pointLight
position={[0, SHADE_TOP_Y + 0.073, 0]}
                color="#ffcf96"
                intensity={dark ? 0.9 : 0.4}
distance={2.05}
                decay={2}
              />
              {/* Retargeted, NOT added — the rig still costs exactly three
                  lights. This one used to sit at the shade's mid-height on a
                  0.43 reach to make the cone glow from inside, which is the
                  job ShadeFabric now does far better and for no light at all.
                  Spending it on the room instead: dropped just under the mouth
                  and widened to 1.75, it is the spill that lands on the pole,
                  the base and the shelf's left flank. The spot alone is a cone
                  at the floor, and a lit lamp with nothing warm around it is
                  the one thing a real lamp never looks like. 1.75 is measured,
                  not rounded up: the lower plank's near end is 0.83 from the
                  mouth and the top plank's is 1.04, so a reach that stops
                  short of 1.1 lights the floor and nothing the visitor is
                  actually looking at. */}
              <pointLight
position={[0, SHADE_BOTTOM_Y - 0.154, 0]}
                color="#ffcf96"
                intensity={dark ? 1.15 : 0.5}
distance={2.99}
                decay={2}
              />
              {/* The warm pool is the light landing on the ground, so it lives
                  in the rig and goes out with the lamp. Light theme 0.12 →
                  0.26: PoolQuad blends NORMALLY (it is a shadow primitive
                  first), so on a pale floor a warm quad has only its hue to
                  work with, and the composer fades it another 0.8 on top. At
                  0.12 there was nothing under the lamp at noon at all, which
                  is the half-done case — a lamp lit for night that stops
                  reading as lit in daylight. */}
              <FootPool
                color="#ffbe73"
size={[1.33, 0.85]}
                opacity={dark ? 0.3 : 0.26}
              />
            </>
          }
        >
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/lamp-floor.glb"
              dark={dark}
              variant="tinted"
              tints={{ metal: palette.metal }}
              scale={LAMP_S}
            />
          </React.Suspense>
        </LampSwitch>
        {/* The lamp's own foot occluding the ground — outside the rig on
            purpose. A switched-off lamp still stands on the floor, so its
            shadow is the one thing here that must not dim. */}
        <FootPool
          color={palette.shadow}
size={[0.50, 0.36]}
          opacity={0.3}
          position={[0, 0.002, 0]}
        />
      </group>
    </>
  );
}
