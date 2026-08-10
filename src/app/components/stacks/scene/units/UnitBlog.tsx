"use client";

// Musings — leaning notebook spines (front three are the latest posts), a
// real open book mid-thought, headphones, tea, and a pinned corkboard;
// paper stack + pen cup below.
import React, { useMemo } from "react";

import { RoundedBox } from "@react-three/drei";

import { Sway, SteamCup } from "../eggs";
import Grabbable from "../Grabbable";
import { ContactShade } from "../GroundPool";
import PropLink from "../links";
import LitImage from "../LitImage";
import ModelProp from "../ModelProp";
import { NotebookLean, PaperStack, Polaroid } from "../objects";
import { PhotoMount } from "../photos";
import { Bookend, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

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
          <group position={[0.25, 0, 0]}>
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
            base={[-0.55, 0, 0]}
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
          <group position={[0.72, 0, -0.04]} rotation={[0, -0.5, 0]}>
            <React.Suspense fallback={null}>
              <ModelProp
                url="/models/lamp-table.glb"
                dark={dark}
                scale={1.9}
              />
            </React.Suspense>
            <pointLight
              position={[0, 0.44, 0]}
              intensity={dark ? 0.55 : 0.24}
              distance={1.1}
              decay={2}
              color="#ffcf9a"
            />
            <ContactShade
              color={palette.shadow}
              width={0.26}
              position={[0, 0.02, 0.01]}
            />
          </group>
          {/* Joshua Tree solo walk — the contemplative register of the
              unit, framed small on the empty lower-left. */}
          <PhotoMount
            unitIndex={index}
            id="musings-walk"
            position={[-1.0, 0.152, 0]}
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
          upright because something holds it up. */}
      <group position={[-0.4, 0, 0.02]}>
        <Bookend palette={palette} flip />
      </group>
      {/* Cactus at the bare left plank end. A cactus and not the monstera
          for one reason: under a plank the monstera needs 0.82 of headroom
          against a gap of about 1.0, and this end of the shelf is where the
          eye lands first. The cactus needs 0.27. It also gives the unit a
          third vertical mass spread across its width, instead of one cluster
          left of centre. */}
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
          surface clearance, by dense sampling. */}
      <group position={[0.14, 0, -0.18]} rotation={[-0.28, 0.35, 0.02]}>
        <React.Suspense fallback={null}>
          <ModelProp url="/models/corkboard.glb" dark={dark} scale={0.9} />
        </React.Suspense>
        {[
          { src: "/images/stacks/pin-dunes.jpg", x: -0.17, y: 0.22, roll: -0.08 },
          { src: "/images/stacks/pin-trail.jpg", x: 0.11, y: 0.28, roll: 0.1 },
          { src: "/images/stacks/pin-creek.jpg", x: -0.02, y: 0.09, roll: 0.04 },
          // Fourth pin: alone on an empty shore, walking away — the quietest
          // frame in the archive, and the board had room low-right.
          { src: "/images/stacks/musings-shore.jpg", x: 0.15, y: 0.07, roll: -0.06 },
        ].map((pin) => (
          // A pinned print can only come toward you: the brass holds its top
          // corner, so the standing lift's rise would tear it off the board.
          // The pin rides along, and the roll levels out under the pointer.
          <PhotoMount
            key={pin.src}
            unitIndex={index}
            id={pin.src}
            position={[pin.x, pin.y, 0.022]}
            rotation={[0, 0, pin.roll]}
            lift={[0, 0, 0.01]}
          >
            <Polaroid
              src={pin.src}
              palette={palette}
              size={0.11}
              textured={textured}
            />
            <mesh position={[0, 0.075, 0.008]}>
              <sphereGeometry args={[0.008, 10, 10]} />
              <meshStandardMaterial
                color={palette.hub}
                metalness={0.4}
                roughness={0.4}
              />
            </mesh>
          </PhotoMount>
        ))}
      </group>
      <ContactShade
        color={palette.shadow}
        width={0.6}
        position={[0.12, 0.03, -0.07]}
      />
    </ShelfUnit>
  );
}
