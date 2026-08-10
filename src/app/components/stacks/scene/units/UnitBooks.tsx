"use client";

// The library — packed cover/spine rows on both shelves plus a floor pile,
// bookends holding the loose row ends, and a step ladder standing open on
// the unit's left flank. The featured covers open their own notes; every
// other book on the unit — spine, flat stack, leaner, pile — opens the
// library itself (`linkUnit`).
import { useFrame } from "@react-three/fiber";
import React, { useMemo, useRef } from "react";
import * as THREE from "three";

import { EggTrigger } from "../eggs";
import { FootPool } from "../GroundPool";
import { HoverProp } from "../links";
import ModelProp from "../ModelProp";
import { Polaroid, polaroidSeat } from "../objects";
import { DeskFrame, deskFrameHeight, PhotoMount } from "../photos";
import { Bookend, BookPile, BookRowMesh, packRow, ShelfUnit } from "../primitives";
import { useUnitLod } from "../useUnitLod";
import { type UnitProps } from "./types";

/** Rest tilts for this unit's two leaning prints. Named because each is used
 * twice — to pose the print, and to derive the height at which that pose lands
 * on the plank. They were mounted at a bare 0.1425, which was `oldHeight/2 ·
 * cos(lean)` for a Polaroid that has not been 0.24 wide since it was pinned to
 * the house scale, leaving both prints 1.5 cm off the wood. */
const TILT_QUIET: [number, number, number] = [-0.14, -0.1, 0.03];
const TILT_GOLDENHOUR: [number, number, number] = [-0.16, 0.24, -0.05];

/** ladder.glb is an A-FRAME step ladder (1.224 wide × 2.248 tall × 0.717
 * deep, four feet, 100% of the footprint resting on y 0), not the rolling
 * library ladder the old comment claimed. It was authored raked −0.25 rad
 * about Z so it would "lean on the plank end", which tips a four-footed
 * frame onto two feet and drives its right rail through the shelf's left
 * plank and leg — that is the whole of "out of place". It stands level
 * now, clear of the case.
 *
 * The yaw is the other half of the fix and it is not a taste call. The
 * treads run along Z and the splay is in X, so square-on (the old 0.1) the
 * rungs are edge-on and the prop renders as a bare letter A — an easel, not
 * a ladder. `node scripts/stacks-render.mjs ladder` shows the three views:
 * only the 45-degree one carries both the splay and the treads. 0.85 lands
 * near that once the unit's own yaw is taken off, and the widest the frame
 * gets there is 0.377 from centre, which clears the plank end at −1.6345
 * from x −2.10 by 0.088.
 *
 * Scale stays 0.56: at 0.56 it is 1.259 world tall against a bookcase whose
 * top plank is 1.150 above the ground, i.e. a step ladder you'd actually
 * keep beside this case. The audit's 0.90 is measured against a ROLLING
 * library ladder (2.10 m) and would put a two-storey frame next to a 1.16 m
 * bookcase.
 *
 * Click nudges it a hand's width along the floor and back, the way a step
 * ladder gets shoved aside; the contact pool is inside the sliding group so
 * the shadow travels with it. */
/** Bookend hit proxy. The L-steel's vertical plate is 0.012 wide — three
 * pixels from the camera — so hovering it is luck, not aim. A zero-opacity
 * box gives it a 17-pixel target, the same trick the golf ball uses. Kept
 * narrow on purpose: the packed row starts a few centimetres away and a
 * generous proxy would claim the first spine's slot instead. */
function BookendTarget() {
  return (
    <mesh position={[0, 0.11, 0]}>
      <boxGeometry args={[0.07, 0.23, 0.16]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function StepLadder({
  unitIndex,
  dark,
  shadow,
}: {
  unitIndex: number;
  dark: boolean;
  shadow: string;
}) {
  const ref = useRef<THREE.Group>(null);
  const out = useRef(false);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const target = out.current ? -0.2 : 0;
    if (g.position.x === target) return;
    const next = THREE.MathUtils.damp(g.position.x, target, 3.2, delta);
    g.position.x = Math.abs(next - target) < 5e-4 ? target : next;
  });
  return (
    <group position={[-2.1, -1.115, 0.1]}>
      <EggTrigger
        unitIndex={unitIndex}
        hoverKey="egg:ladder"
        onTrigger={() => {
          out.current = !out.current;
        }}
      >
        <group ref={ref}>
          <React.Suspense fallback={null}>
            <ModelProp
              url="/models/ladder.glb"
              dark={dark}
              rotation={[0, 0.85, 0]}
              scale={0.56}
            />
          </React.Suspense>
          {/* A frame of 4cm rails and 2cm treads is a thin target from 5.8
              units away, so the click gets the same invisible proxy the golf
              ball uses. 0.5 wide, not the frame's full 0.75: an unyawed box
              at the frame's width reached world −1.48 on screen and claimed
              the top shelf's bookend out from under it (measured, not
              guessed). This covers the middle two thirds of the A and stops
              65px short of the bookend. */}
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[0.5, 1.26, 0.5]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <FootPool color={shadow} size={[0.72, 0.6]} />
        </group>
      </EggTrigger>
    </group>
  );
}

export default function UnitBooks({
  data,
  palette,
  dark,
  index,
  coverWidth,
  onOpenBook,
}: UnitProps) {
  const textured = useUnitLod(index);
  const covers = useMemo(
    () =>
      data.shelfBooks
        .filter((book) => book.coverUrl)
        .map((book) => ({ url: book.coverUrl!, key: book.id })),
    [data.shelfBooks],
  );
  const topRow = useMemo(
    () => packRow(2.9, covers.slice(0, 8), palette, 3),
    [covers, palette],
  );
  const lowerRow = useMemo(
    () => packRow(1.9, covers.slice(8, 14), palette, 11),
    [covers, palette],
  );

  return (
    <group>
      <ShelfUnit
        palette={palette}
        toneSeed={index}
        lower={
          <group>
            <group position={[0.35, 0, 0]}>
              <BookRowMesh
                items={lowerRow}
                palette={palette}
                salt={11}
                textured={textured}
                coverWidth={coverWidth}
                onCoverClick={onOpenBook}
                linkUnit={index}
              />
              {/* L-steel pair holds the short row's loose start. It is
                  authored 2.6° off plumb — a bookend takes the row's lean —
                  and the pointer eases it upright, as if you had just
                  straightened the shelf. Same rest+settle channel the
                  photographs use, so it settles on the house curve. */}
              <HoverProp
                unitIndex={index}
                hoverKey="bookend:books:lower"
                base={[-1.0, 0, 0]}
                lift={[0, 0, 0.012]}
                rest={[0, 0, -0.046]}
                settle={0.046}
              >
                <Bookend palette={palette} />
                <BookendTarget />
              </HoverProp>
            </group>
            <BookPile palette={palette} x={-0.85} salt={23} linkUnit={index} />
            {/* Both rows are packed edge to edge, so the photographs prop
                against the books at the shelf's front lip (z 0.22 clears the
                0.3-deep spines) — which is where you'd actually stand a
                picture on a full bookshelf. NOISE in his own hand in front
                of his own shelf is the anchor; it earns the frame — and it
                links, since the tweet id survived verbatim in the archived
                filename. */}
            <PhotoMount
              unitIndex={index}
              id="books-noise"
              position={[-0.22, deskFrameHeight(0.21) / 2, 0.22]}
              rotation={[-0.05, 0.14, 0]}
              href="https://x.com/i/status/1835742939928240302"
            >
              <DeskFrame
                src="/images/stacks/books-noise.jpg"
                palette={palette}
                textured={textured}
                width={0.28}
                height={0.21}
              />
            </PhotoMount>
            <PhotoMount
              unitIndex={index}
              id="books-quiet"
              position={[0.2, polaroidSeat(TILT_QUIET), 0.24]}
              rotation={TILT_QUIET}
            >
              <Polaroid
                src="/images/stacks/books-quiet.jpg"
                palette={palette}
                textured={textured}
                anchor="contact"
              />
            </PhotoMount>
            {/* Left of the floor pile, clear of both packed rows — in front
                of the TOP row it covered a featured cover, which is the one
                thing the shelf can't afford. */}
            <PhotoMount
              unitIndex={index}
              id="books-goldenhour"
              position={[-1.16, polaroidSeat(TILT_GOLDENHOUR), 0.12]}
              rotation={TILT_GOLDENHOUR}
            >
              <Polaroid
                src="/images/stacks/books-goldenhour.jpg"
                palette={palette}
                textured={textured}
                anchor="contact"
              />
            </PhotoMount>
          </group>
        }
      >
        {/* x −0.1 un-hides the rightmost cover from the desktop placard. */}
        <group position={[-0.1, 0, 0]}>
          <BookRowMesh
            items={topRow}
            palette={palette}
            salt={3}
            textured={textured}
            coverWidth={coverWidth}
            onCoverClick={onOpenBook}
            linkUnit={index}
          />
          {/* Its twin on the top row, leaning the other way against the
              packed spines. */}
          <HoverProp
            unitIndex={index}
            hoverKey="bookend:books:top"
            base={[-1.48, 0, 0]}
            lift={[0, 0, 0.012]}
            rest={[0, 0, 0.042]}
            settle={0.042}
          >
            <Bookend palette={palette} />
            <BookendTarget />
          </HoverProp>
        </group>
      </ShelfUnit>
      <StepLadder unitIndex={index} dark={dark} shadow={palette.shadow} />
    </group>
  );
}
