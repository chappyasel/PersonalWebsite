"use client";

// Shelf-world primitives ported from the approved prototype: shelf units,
// packed book rows, piles, lamp + glow, frames, and training props.
// Box props use RoundedBox — edge highlights are the cheapest "crafted vs
// primitive" signal; perfect 90° corners are the strongest primitive tell.
import { useStacks } from "../store";
import { PALETTES, type Palette, rand } from "../theme";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import Grabbable from "./Grabbable";
import { ContactShade } from "./GroundPool";
import HeldFacing from "./HeldFacing";
import Lift from "./Lift";
import LitImage from "./LitImage";
import { RoundedBox } from "./RoundedBox";
import ShelfSpacingProbe from "./ShelfSpacingProbe";
import { proxiedBookCover } from "./bookCoverTexture";
import {
  bookRowHoverKey,
  bookRowNodeName,
  featuredRiserHoverKey,
} from "./bookInteractions";
import {
  DESK_LAMP_MOUTH,
  DESK_LAMP_MOUTH_RADIUS,
  DESK_LAMP_MOUTH_TILT,
  deskLampPointAlongAxis,
} from "./deskLampHead";
import { registerSceneInteraction } from "./interactionRegistry";
import PropLink, { type PropDestination } from "./links";
import { MOTH_LIGHT_PROFILES, registerMeadowLamp } from "./meadowLights";
import { sceneUnitLightUserData } from "./sceneGpuPrewarm";
import {
  SCENE_IMPULSE_LIGHT_DURATION,
  getSceneImpulse,
  sceneImpulseLightScale,
  sceneImpulseStrengthAt,
} from "./sceneImpulse";
import {
  practicalGlowHaloEnabled,
  practicalGlowSpriteEnabled,
  useScenePerformanceSettings,
  useUnitRealLights,
} from "./scenePerformance";
import {
  SHELF_GEOMETRY,
  SHELF_PLANKS,
  SHELF_SURFACE,
  SHELF_UNDERSIDE,
  shelfPerchOwnerId,
} from "./shelfGeometry";
import { StaticWorldRoot } from "./staticWorld";
import { useUnitFrame } from "./unitActivity";

export type RowItem =
  | { kind: "spine"; x: number; w: number; h: number; color: string }
  | {
      kind: "flat";
      x: number;
      n: number;
      colors: string[];
      width?: number;
      height?: number;
      depth?: number;
      staggerX?: number;
    }
  | { kind: "lean"; x: number; w: number; h: number; color: string }
  /** A face-out book. Everything past `key` is POSE, and every one of them
   * defaults to the old dead-upright cover, so a caller that only knows where
   * it wants the book still gets what it always got. They exist because eight
   * covers at one size, one angle and one depth read as a product grid pasted
   * onto a plank however carefully they are spaced — see the layout note in
   * UnitBooks. The pose is authored by the CALLER rather than rolled here: the
   * lean of a book and the pitch to the neighbour it leans on are one
   * measurement, and splitting them across two files is how this scene's
   * leaning props keep ending up in mid-air. */
  | {
      kind: "cover";
      x: number;
      url: string;
      key: string;
      /** Human title used by the Door Label; never reconstructed from a slug. */
      label?: string;
      /** Author, the Door Label's detail line under the title. */
      author?: string;
      /** Server-sampled jacket perimeter color for this physical shell. */
      color?: string;
      /** Physical fore-edge thickness derived from the book's page/runtime
       * length, clamped to the readable low-poly shelf range. */
      thickness?: number;
      /** Uniform scale. A shelf of one book size is a shelf of one book. */
      s?: number;
      /** Yaw about Y — the book turned a few degrees off square. */
      yaw?: number;
      /** Lean about Z, radians. POSITIVE tips the head to the LEFT, i.e. onto
       * a neighbour standing to the left of it. The seat below compensates. */
      lean?: number;
      /** Depth offset from the row's own z, so the fronts are not one plane. */
      dz?: number;
      /** Height of the flat book (or two) this one stands ON, 0 for straight
       * on the wood. The riser is drawn here and stays on the shelf when the
       * cover lifts — it is the shelf's, not the book's. */
      riser?: number;
    };

/** Half-extents of a featured cover at scale 1, and the 4 mm its bevel is
 * buried by. Read by the seat below, by the geometry, and by the caller doing
 * the packing — the width of this box is the one number the layout, the mesh
 * and the contact height all have to agree on. */
export const COVER_W = 0.36;
export const COVER_H = 0.52;
const COVER_SINK = 0.004;

/**
 * Where a featured cover's origin has to sit for its lowest corner to land on
 * the wood, given its scale, its lean and whatever it is standing on.
 *
 * A tilted box's contact point is NOT its bounding-box minimum, and this is
 * the single most-regrown bug in this scene. The box turns about its own
 * centre, so a lean of θ about Z drops one bottom corner to
 * −(halfH·cos θ + halfW·|sin θ|) — the second term is the one everybody
 * forgets, and forgetting it drives that corner straight through the plank.
 * Yaw is deliberately absent: a rotation about Y leaves the base flat and
 * moves the contact height by exactly nothing.
 */
export function coverSeat(s: number, lean: number, riser: number): number {
  return (
    riser +
    s *
      ((COVER_H / 2) * Math.cos(lean) +
        (COVER_W / 2) * Math.abs(Math.sin(lean))) -
    COVER_SINK
  );
}

/** Half the x a cover eats, lean included. Both extremes of a rotated box are
 * ±(halfW·cos θ + halfH·|sin θ|) — symmetric, which is why the packer can add
 * two of these and get the pitch at which two books touch. */
export function coverExtent(s: number, lean: number): number {
  return (
    s *
    ((COVER_W / 2) * Math.cos(lean) + (COVER_H / 2) * Math.abs(Math.sin(lean)))
  );
}

/** Width below which a spine gets no printed detail at all. Not every book on
 * a shelf has bands and a title block — a row where all fourteen do is a
 * wallpaper pattern, which is the other way to fail at "these are books". */
const DETAIL_MIN_W = 0.068;
/** Along-axis lean of a leaning spine, radians. Used at three places (the
 * pose, the contact height, and the gap packRow opens in front of it), so it
 * is declared once: a lean typed into two of the three is the bug this file
 * keeps regrowing. */
const LEAN = 0.17;

export function packRow(
  width: number,
  covers: { url: string; key: string; label?: string }[],
  palette: Palette,
  salt: number,
): RowItem[] {
  const items: RowItem[] = [];
  let x = -width / 2 + 0.1;
  let coverIdx = 0;
  let i = 0;
  let flats = 0;
  let leaned = false;
  // Two stacks on a long row, one on a short one. A single flat stack on a
  // 2.9 row is one incident in three feet of upright spines.
  const maxFlats = width > 2.4 ? 2 : 1;
  // The tail margin exists so the loop can never start a 0.34-wide COVER it
  // has no room to finish. A row with no covers to place has nothing to
  // reserve for, and reserving anyway left a spine-only row a quarter of a
  // unit short of the width it was asked for.
  const tail = covers.length ? 0.25 : 0.1;
  while (x < width / 2 - tail) {
    const roll = rand(i, salt);
    if (roll > 0.7 && coverIdx < covers.length) {
      const w = 0.34;
      items.push({ kind: "cover", x: x + w / 2, ...covers[coverIdx]! });
      x += w + 0.04;
      coverIdx++;
    } else if (roll < 0.04) {
      // A gap, and — once per row — a book leaning back into it. A leaner
      // mid-row is the single most "real shelf" thing a packed row can do, and
      // it is only physically possible where there is somewhere to lean.
      // The gap is a fixed 0.105 rather than the old 0.06…0.14 because it has
      // to CLEAR the lean, and the clearance is small. The box turns about its
      // own centre, so its top-left corner sits (w/2)·cos θ + (h/2)·sin θ left
      // of centre: at the worst roll here (w 0.085, h 0.58) that is 0.0916, so
      // 0.105 leaves 0.0134 between the leaner's head and the book behind it —
      // touching, which is what leaning means, without passing through. An
      // overlap here is exactly the kind a screenshot cannot show you, because
      // interpenetration and layering look identical from one camera.
      if (!leaned && x > -width / 2 + 0.5 && x < width / 2 - 0.6) {
        x += 0.105;
        items.push({
          kind: "lean",
          x,
          w: 0.055 + rand(i, salt + 2) * 0.03,
          h: 0.4 + rand(i, salt + 3) * 0.18,
          color:
            palette.spines[
              Math.floor(rand(i, salt + 4) * palette.spines.length)
            ]!,
        });
        x += 0.075;
        leaned = true;
      } else {
        x += 0.06 + rand(i, salt + 1) * 0.08;
      }
    } else if (flats < maxFlats && roll >= 0.04 && roll < 0.1) {
      // A horizontal stack lying on the row — real shelves are never all
      // vertical (audit §3-Books).
      const n = 2 + Math.round(rand(i, salt + 6));
      items.push({
        kind: "flat",
        x: x + 0.17,
        n,
        colors: Array.from(
          { length: n },
          (_, j) =>
            palette.spines[
              Math.floor(rand(i + j, salt + 7) * palette.spines.length)
            ]!,
        ),
      });
      x += 0.34 + 0.03;
      flats++;
    } else {
      // Widths are drawn from two families rather than one flat range: most
      // books on a shelf are 20–30 mm and a few are 45+ (an atlas, a monograph,
      // the one hardback nobody finishes). A uniform 0.055…0.130 puts an even
      // spread of intermediate thicknesses on the shelf, which is what makes a
      // packed row read as extruded rather than collected.
      const fat = rand(i, salt + 12) > 0.78;
      const w = fat
        ? 0.098 + rand(i, salt + 2) * 0.042
        : 0.048 + rand(i, salt + 2) * 0.036;
      // Tall books tend to be the fat ones, so the two correlate rather than
      // being rolled independently.
      const h = (fat ? 0.5 : 0.4) + rand(i, salt + 3) * 0.16;
      const color =
        palette.spines[Math.floor(rand(i, salt + 4) * palette.spines.length)]!;
      items.push({ kind: "spine", x: x + w / 2, w, h, color });
      x += w + 0.012;
    }
    i++;
  }
  const endHeight = 0.4 + rand(i, salt + 3) * 0.1;
  const endColor =
    palette.spines[Math.floor(rand(i, salt + 4) * palette.spines.length)]!;
  // The end book may lean only when its upper-left edge has a tall neighbor
  // to bear against. A flat stack or a preceding gap supports nothing at that
  // height; appending the old unconditional leaner there produced the
  // freestanding diagonal book on Musings. Keep those end books upright.
  if (items.at(-1)?.kind === "spine") {
    items.push({
      kind: "lean",
      x: x + 0.05,
      w: 0.06,
      h: endHeight,
      color: endColor,
    });
  } else {
    items.push({
      kind: "spine",
      x: x + 0.03,
      w: 0.06,
      h: endHeight,
      color: endColor,
    });
  }
  return items;
}

/**
 * The printing on a spine: hubs, rules, a title block, a publisher's panel.
 *
 * Drawn on a transparent overlay so the spine keeps its own material colour,
 * and cached by variant — the canvas count stays O(variants), not O(spines),
 * which is what lets every row in the world pay for this.
 *
 * Six kinds, because the failure mode of the previous two (bands, or bands +
 * dashes) was that half the shelf carried an identical mark at an identical
 * height. What a real row has is a handful of DIFFERENT conventions sitting
 * next to each other: a clothbound with raised hubs, a paperback with a solid
 * label panel, a gilt-ruled hardback, a modern jacket with type running the
 * length of it, and one or two with nothing on them at all.
 *
 * All of it is unreadable by design. At this camera a spine is 6–14 px wide,
 * so anything that resolves as letters would resolve as WRONG letters — the
 * marks are the right size, weight and rhythm for type and nothing more.
 */
const spineDetailCache = new Map<string, THREE.CanvasTexture>();
function spineDetailTexture(ink: string, variant: number): THREE.CanvasTexture {
  const key = `${ink}|${variant}`;
  const hit = spineDetailCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const bandY = (v: number) => (variant % 2 === 0 ? v : v + 6);
  const dashes = (top: number, bottom: number, w: number, seed: number) => {
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.62;
    let y = top;
    for (let j = 0; j < 6; j++) {
      const h = 13 + rand(j, seed) * 24;
      if (y + h > bottom) break;
      ctx.fillRect(32 - w / 2, y, w, h);
      y += h + 11;
    }
    ctx.globalAlpha = 1;
  };
  if (variant === 0) {
    // Plain. Not an omission — see the note above.
  } else if (variant === 1) {
    // Raised hubs: the four ridges a sewn cloth binding has across its spine.
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    for (const y of [58, 108, 158, 208]) ctx.fillRect(0, bandY(y), 64, 7);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (const y of [58, 108, 158, 208]) ctx.fillRect(0, bandY(y) - 3, 64, 3);
  } else if (variant === 2) {
    // Head and tail rules with type between them.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (const y of [18, 30, 218, 230]) ctx.fillRect(6, y, 52, 5);
    dashes(70, 196, 11, variant);
  } else if (variant === 3) {
    // Paperback: a solid label panel with the title reversed out of it.
    ctx.fillStyle = "rgba(255,252,244,0.62)";
    ctx.fillRect(4, 52, 56, 152);
    dashes(66, 190, 10, variant);
  } else if (variant === 4) {
    // Long type running the length of the spine, publisher's mark at the tail.
    dashes(30, 214, 12, variant);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(24, 226, 16, 12);
    ctx.globalAlpha = 1;
  } else {
    // Gilt double rule top and bottom, nothing between.
    ctx.fillStyle = "rgba(255,224,160,0.5)";
    for (const y of [22, 32, 216, 226]) ctx.fillRect(8, y, 48, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  spineDetailCache.set(key, texture);
  return texture;
}

/** Swallows texture-load failures for a single cover so one broken URL
 * degrades to a blank book instead of killing the canvas. */
export class CoverBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** A scenery book in a packed row: a plain positioned group, or — when the
 * row knows its unit — a door into the library with the standard hover lift.
 * The five featured covers keep their own modal; everything else on the
 * shelf is the rest of the library, so it opens the library. */
function ShelfBook({
  linkUnit,
  to = "books",
  hoverKey,
  base,
  lift,
  rest,
  settle,
  grabbable = false,
  shadeColor,
  children,
}: {
  linkUnit?: number;
  to?: PropDestination;
  hoverKey: string;
  base: [number, number, number];
  lift: [number, number, number];
  /** The book's authored lean. It belongs to the lift, not to a wrapping
   * group, so the hover can ease it away — see `settle`. */
  rest?: [number, number, number];
  settle?: number;
  /** Carry this individual volume while retaining its tap destination. */
  grabbable?: boolean;
  shadeColor?: string;
  children: React.ReactNode;
}) {
  if (linkUnit === undefined)
    return (
      <group position={base} rotation={rest}>
        {children}
      </group>
    );
  if (grabbable && shadeColor)
    return (
      <Grabbable
        unitIndex={linkUnit}
        hoverKey={hoverKey}
        base={base}
        shadeColor={shadeColor}
        // A row book's base is its centre, not the plank. The shelf already
        // supplies the shared contact shadow.
        shadeWidth={0}
        shape="box"
        massKg={0.65}
        to={to}
      >
        <group rotation={rest}>{children}</group>
      </Grabbable>
    );
  return (
    <PropLink
      unitIndex={linkUnit}
      to={to}
      hoverKey={hoverKey}
      base={base}
      lift={lift}
      rest={rest}
      settle={settle}
      tip={0}
    >
      {children}
    </PropLink>
  );
}

/** Background volumes advertise their Door by lifting vertically. They never
 * move toward the camera: that path crosses the front-rank cover plane and
 * produces exactly the z-fighting the owner reported. The global hover scale
 * turns 0.025 into a restrained 0.05-unit rise. */
const SPINE_LIFT: [number, number, number] = [0, 0.025, 0];
/** Keep each book's authored organic roll while it rises. */
const SPINE_SETTLE = 0;
// A volume inside a horizontal stack cannot rise without entering the one
// above it, so this one family retains a small forward pull.
const FLAT_LIFT: [number, number, number] = [0, 0, 0.07];
/* There is deliberately no SPINE_SINK any more.
 *
 * It was 0.006 — half the RoundedBox corner radius — sunk into the plank to
 * bury the bevel's bottom rim, which catches the key light exactly where a
 * contact shadow should be. The cost was that both book rows sat 0.30 cm INTO
 * the wood and arrived as a "sunk" finding every round, which is the same
 * complaint from the owner ("the books look wrong") read from the other side.
 *
 * The comment that stood here claimed an `@floaters-allowance` tag which
 * scripts/stacks-floaters.mjs measured against; it does not, and never did —
 * there is no such string anywhere in that script. The tag made a real finding
 * look handled. Removed rather than implemented, because the detector is not
 * this file's to change and a seat that needs an exemption is not a seat.
 *
 * If the bevel rim ever reads bright again, fix it on the GEOMETRY — drop the
 * RoundedBox `radius` below, so there is less bevel to catch light — rather
 * than by pushing the book through the shelf, which is the move that cannot be
 * distinguished from the bug. */

/** Name prefix for a spine's stable diagnostic node. */
export const SPINE_NODE = "stacks-spine";
export const FEATURED_COVER_Z = 0.06;

const BOOK_PART_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const bookPartMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const BOOK_BOARD = 0.006;
const BOOK_PAGE_INSET = 0.016;

/** A normal hardcover depth is roughly two-thirds of its height. Keeping the
 * result inside the shelf's measured range prevents short books becoming
 * square blocks and tall books becoming shallow tiles. */
export function packedBookDepth(height: number, index: number, salt: number) {
  const ratio = 0.6 + rand(index, salt + 11) * 0.08;
  const raw = Math.max(0.24, height * ratio);
  return 0.24 + 0.1 * Math.tanh((raw - 0.24) / 0.1);
}

function bookPartMaterial(color: string, roughness: number) {
  // Five-point roughness buckets preserve variation without retaining one
  // material per book when the shared geometry intentionally survives LOD
  // remounts.
  const resolvedRoughness = Math.round(roughness * 20) / 20;
  const key = `${color}|${resolvedRoughness}`;
  const cached = bookPartMaterialCache.get(key);
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: resolvedRoughness,
  });
  bookPartMaterialCache.set(key, material);
  return material;
}

function BookPart({
  size,
  position,
  color,
  roughness,
  castShadow = false,
}: {
  size: [number, number, number];
  position?: [number, number, number];
  color: string;
  roughness: number;
  castShadow?: boolean;
}) {
  return (
    <mesh
      castShadow={castShadow}
      geometry={BOOK_PART_GEOMETRY}
      material={bookPartMaterial(color, roughness)}
      dispose={null}
      scale={size}
      position={position}
    />
  );
}

/** Low-poly spine-out book: a recessed page block between two boards, with a
 * real spine closing the front. Four boxes are enough to stop every oblique
 * view from turning the library into a row of colored bricks. */
function UprightBookVolume({
  width,
  height,
  depth,
  color,
  pages,
  roughness,
}: {
  width: number;
  height: number;
  depth: number;
  color: string;
  pages: string;
  roughness: number;
}) {
  return (
    <group>
      <BookPart
        size={[
          Math.max(0.012, width - BOOK_BOARD * 2),
          height - BOOK_PAGE_INSET,
          depth - BOOK_PAGE_INSET,
        ]}
        position={[0, -0.002, -0.004]}
        color={pages}
        roughness={0.9}
        castShadow
      />
      {[-1, 1].map((side) => (
        <BookPart
          key={side}
          size={[BOOK_BOARD, height, depth]}
          position={[side * (width / 2 - BOOK_BOARD / 2), 0, 0]}
          color={color}
          roughness={roughness}
        />
      ))}
      <BookPart
        size={[width, height, BOOK_BOARD]}
        position={[0, 0, depth / 2 - BOOK_BOARD / 2]}
        color={color}
        roughness={roughness}
      />
    </group>
  );
}

/** The same construction on its side for stacks and featured-book risers. */
function FlatBookVolume({
  width,
  height,
  depth,
  color,
  pages,
}: {
  width: number;
  height: number;
  depth: number;
  color: string;
  pages: string;
}) {
  return (
    <group>
      <BookPart
        size={[
          width - BOOK_PAGE_INSET,
          Math.max(0.012, height - BOOK_BOARD * 2),
          depth - BOOK_PAGE_INSET,
        ]}
        position={[0, 0, -0.004]}
        color={pages}
        roughness={0.9}
        castShadow
      />
      {[-1, 1].map((side) => (
        <BookPart
          key={side}
          size={[width, BOOK_BOARD, depth]}
          position={[0, side * (height / 2 - BOOK_BOARD / 2), 0]}
          color={color}
          roughness={0.72}
        />
      ))}
      <BookPart
        size={[width, height, BOOK_BOARD]}
        position={[0, 0, depth / 2 - BOOK_BOARD / 2]}
        color={color}
        roughness={0.72}
      />
    </group>
  );
}

function FaceOutBookVolume({
  thickness,
  color,
  pages,
}: {
  thickness: number;
  color: string;
  pages: string;
}) {
  return (
    <>
      <RoundedBox
        castShadow
        args={[COVER_W - 0.014, COVER_H - 0.014, thickness - 0.01]}
        radius={0.005}
        smoothness={3}
        position={[0.005, 0, -thickness / 2 - 0.003]}
      >
        <meshStandardMaterial color={pages} roughness={0.88} />
      </RoundedBox>
      {[0, -thickness - 0.006].map((zBoard) => (
        <RoundedBox
          key={zBoard}
          castShadow
          args={[COVER_W, COVER_H, 0.006]}
          radius={0.002}
          smoothness={3}
          position={[0, 0, zBoard]}
        >
          <meshStandardMaterial color={color} roughness={0.7} />
        </RoundedBox>
      ))}
      <RoundedBox
        castShadow
        args={[0.014, COVER_H, thickness + 0.006]}
        radius={0.004}
        smoothness={3}
        position={[-COVER_W / 2 + 0.007, 0, -thickness / 2 - 0.003]}
      >
        <meshStandardMaterial color={color} roughness={0.74} />
      </RoundedBox>
    </>
  );
}

/** Stable named wrapper for diagnostics. Motion now belongs entirely to the
 * parent Lift, whose y-position can be compared without camera/parallax noise. */
function SpineTip({
  name,
  height,
  depth,
  children,
}: {
  name: string;
  height: number;
  depth: number;
  children: React.ReactNode;
}) {
  return (
    <group position={[0, -height / 2, depth / 2]}>
      <group name={name}>
        <group position={[0, height / 2, -depth / 2]}>{children}</group>
      </group>
    </group>
  );
}

/** The authored roll of spine `i`. Read in two places — the mount y below and
 * the `rest` tilt — so it is a function rather than an inline expression: a
 * roll typed into one and not the other is the bug this file keeps regrowing.
 * `rand` is a pure hash of (i, salt), so calling it twice is free and always
 * agrees with itself. */
const spineRoll = (i: number, salt: number) => rand(i, salt + 5) * 0.04 - 0.02;

/* The mount y of a rolled spine is written INLINE at the call site below
 * rather than wrapped in a `spineSeat(h, w, roll)` helper, and that is
 * deliberate. A spine's width and height are packRow's outputs, which
 * scripts/stacks-floaters.mjs carries as SYMBOLS — it proves the row seated by
 * cancelling them against the geometry it measures. It inlines a helper before
 * deferring to one, but keeps the inlined answer only when it reduces to a
 * constant, so a helper taking those symbols becomes an opaque `spineSeat()`
 * term and the detector downgrades both book rows from "seated" to
 * "indeterminate". Left inline the expression stays linear in item.h and
 * item.w, and the checker can still do the algebra. Verified both ways. */

/**
 * One face-out book: the pose, the riser it may be standing on, and the note
 * it opens.
 *
 * It is a component rather than a branch inlined in BookRowMesh's map because
 * the pose is now five numbers that have to agree with each other — the seat
 * is a function of the lean AND the scale AND the riser, and the untextured
 * LOD silhouette has to be posed identically or the shelf rearranges itself
 * when you walk toward it. Written twice, they would disagree; this file's
 * whole history is numbers that were written twice.
 */
function FeaturedCover({
  item,
  palette,
  textured,
  coverWidth,
  onCoverClick,
  linkUnit,
  to,
  riserColor,
  grabbable,
  grabbableRiser,
}: {
  item: Extract<RowItem, { kind: "cover" }>;
  palette: Palette;
  textured: boolean;
  coverWidth: 256 | 384;
  onCoverClick?: (key: string) => void;
  linkUnit?: number;
  to: PropDestination;
  riserColor: string;
  grabbable?: boolean;
  grabbableRiser?: boolean;
}) {
  const setHovered = useStacks((s) => s.setHovered);
  const s = item.s ?? 1;
  const thickness = item.thickness ?? 0.048;
  const lean = item.lean ?? 0;
  const riser = item.riser ?? 0;
  const z = FEATURED_COVER_Z + (item.dz ?? 0);
  const seat = coverSeat(s, lean, riser);
  /** Lean is on the INNER group, not on Lift's `rest`. `rest` is the channel a
   * hover eases away, and a book leaning on its neighbour that straightens
   * itself when you point at it walks its head through that neighbour. */
  const pose: [number, number, number] = [0, item.yaw ?? 0, lean];
  const hoverKey = `book:${item.key}`;
  const riserHoverKey = featuredRiserHoverKey(linkUnit, item.key);
  const riserPose: [number, number, number] = [
    0,
    (item.yaw ?? 0) * 0.5 + 0.06,
    0,
  ];
  const riserBook = (
    <FlatBookVolume
      width={COVER_W * s * 0.86}
      height={riser}
      depth={0.24}
      color={riserColor}
      pages={palette.pages}
    />
  );
  const cover = (draggable: boolean) => {
    const contents = (
      <>
        <FaceOutBookVolume
          thickness={thickness}
          color={item.color ?? palette.cover}
          pages={palette.pages}
        />
        {/* A failed jacket texture degrades to the physical cover above, never
          to a replacement OUTSIDE Grabbable. The book therefore keeps its
          exact tap/carry contract even when an image CDN request fails. */}
        {textured && (
          <CoverBoundary fallback={null}>
            <React.Suspense fallback={null}>
              <LitImage
                url={proxiedBookCover(item.url, coverWidth)}
                width={0.34}
                height={0.5}
                radius={0.012}
                roughness={0.6}
                position={[0, 0, 0.004]}
                onPointerOver={
                  draggable
                    ? undefined
                    : (e) => {
                        e.stopPropagation();
                        setHovered(hoverKey);
                      }
                }
                onPointerOut={
                  draggable
                    ? undefined
                    : () => {
                        if (useStacks.getState().hovered === hoverKey)
                          setHovered(null);
                      }
                }
                onClick={
                  !draggable && onCoverClick
                    ? (e) => {
                        if ((e.delta ?? 0) > 6) return;
                        e.stopPropagation();
                        onCoverClick(item.key);
                      }
                    : undefined
                }
              />
            </React.Suspense>
          </CoverBoundary>
        )}
      </>
    );
    return draggable ? (
      <HeldFacing
        hoverKey={hoverKey}
        position={[0, seat, 0]}
        rest={pose}
        scale={s}
      >
        {contents}
      </HeldFacing>
    ) : (
      <group rotation={pose} scale={s}>
        {contents}
      </group>
    );
  };
  return (
    // Named so the harness can measure the WHOLE assembly, riser included:
    // scripts/stacks-floaters.mjs cannot reach this branch (it resolves
    // `item.kind === "spine"` symbolically and walks the spine arm of the
    // ternary for every row item), so `window.__stacks.bbox("stacks-cover:<id>")`
    // against the plank is the only proof these are seated.
    <group name={`stacks-cover:${item.key}`}>
      {/* The flat book it stands on stays OUTSIDE the cover's carry group, but
          it is still a real visible volume. Its exposed fore-edge owns a
          distinct door into the library and pulls only toward the viewer, so
          it neither steals the face-out cover nor rises through it. */}
      {riser > 0 &&
        (linkUnit === undefined ? (
          <group position={[item.x, riser / 2, z]} rotation={riserPose}>
            {riserBook}
          </group>
        ) : (
          <ShelfBook
            linkUnit={linkUnit}
            to={to}
            hoverKey={riserHoverKey}
            base={[item.x, riser / 2, z]}
            lift={FLAT_LIFT}
            rest={riserPose}
            grabbable={grabbableRiser}
            shadeColor={palette.shadow}
          >
            {riserBook}
          </ShelfBook>
        ))}
      {grabbable && linkUnit !== undefined ? (
        <Grabbable
          unitIndex={linkUnit}
          hoverKey={hoverKey}
          base={[item.x, 0, z]}
          shadeColor={palette.shadow}
          shadeWidth={0.4 * s}
          shape="box"
          massKg={0.65}
          tiltWhileHeld={false}
          onTap={onCoverClick ? () => onCoverClick(item.key) : undefined}
          // Title, author, then the verb. "Preview", because the tap opens
          // the in-room book modal, not the full notes page; a cover with no
          // known title keeps the verb as its whole label.
          doorLabel={onCoverClick ? item.label : undefined}
          doorDetail={onCoverClick && item.author ? [item.author] : undefined}
          actionLabel={onCoverClick ? "Preview book notes" : undefined}
        >
          {cover(true)}
        </Grabbable>
      ) : (
        <Lift
          hoverKey={hoverKey}
          base={[item.x, seat, z]}
          offset={[0, 0.05, 0.06]}
        >
          {cover(false)}
        </Lift>
      )}
    </group>
  );
}

export function BookRowMesh({
  items,
  palette,
  salt,
  textured = true,
  coverWidth = 384,
  onCoverClick,
  linkUnit,
  to = "books",
  grabbableCovers = false,
  grabbableVolumes = false,
  firstCoverArrivalProgress,
}: {
  items: RowItem[];
  palette: Palette;
  salt: number;
  /** false = proximity LOD says far: covers render as blank boards so the
   * packing silhouette is stable while textures stay unmounted. */
  textured?: boolean;
  coverWidth?: 256 | 384;
  onCoverClick?: (key: string) => void;
  /** Unit index — set it and every non-cover book in the row becomes a door
   * into the library. */
  linkUnit?: number;
  /** Where those doors lead. The library for a row of books; Systems' row is
   * the operating manual, and points at that instead. */
  to?: PropDestination;
  /** Opt-in for curated face-out books: carry on drag, keep the existing
   * per-book modal on a tap. Packed spines remain structural shelf rows. */
  grabbableCovers?: boolean;
  /** Opt-in for packed spines, leaners, flat volumes, and featured risers.
   * Each volume keeps its tap destination through tap/drag arbitration. */
  grabbableVolumes?: boolean;
  /** Optional Unit-authored Arrival Beat. Only the first cover participates;
   * packed context and the rest of the featured rank remain still. */
  firstCoverArrivalProgress?: () => number;
}) {
  // Contact darkening under the row. No light in the scene casts a shadow and
  // N8AO runs at half resolution (and not at all on touch), so the line where
  // a spine meets the wood carries no occlusion at all. One billboard per
  // ~0.7 of row keeps the strip readable at the grazing camera angle without
  // paying a sprite per book.
  // Depth follows height instead of being an independent random dimension.
  // Short books therefore stay recognisably book-shaped while the taller
  // hardbacks still fill the shelf's available depth.
  const depths = useMemo(
    () =>
      items.map((item, i) =>
        item.kind === "spine" || item.kind === "lean"
          ? packedBookDepth(item.h, i, salt)
          : 0.3,
      ),
    [items, salt],
  );
  const contact = useMemo(() => {
    if (items.length === 0) return [] as number[];
    let lo = Infinity;
    let hi = -Infinity;
    for (const it of items) {
      const half =
        it.kind === "flat"
          ? (it.width ?? 0.32) / 2
          : it.kind === "cover"
            ? coverExtent(it.s ?? 1, it.lean ?? 0)
            : it.w / 2;
      lo = Math.min(lo, it.x - half);
      hi = Math.max(hi, it.x + half);
    }
    const span = hi - lo;
    const n = Math.max(1, Math.round(span / 0.7));
    return Array.from({ length: n }, (_, k) => lo + (span * (k + 0.5)) / n);
  }, [items]);
  return (
    <group>
      {contact.map((x) => (
        <ContactShade
          key={x}
          color={palette.shadow}
          width={0.9}
          height={0.08}
          position={[x, 0.014, 0.04]}
          opacity={0.14}
        />
      ))}
      {items.map((item, i) =>
        item.kind === "spine" ? (
          // Per-spine depth and a back-aligned z. Every spine used to be
          // exactly 0.3 deep at z 0, so all fourteen front faces were
          // coplanar — a row of books with one perfectly flat face is a
          // milled block, which is what the owner saw. Backs stay squared to
          // the shelf and the fronts step by up to 10cm; hover rises
          // vertically without crossing the front rank.
          <ShelfBook
            key={i}
            linkUnit={linkUnit}
            to={to}
            hoverKey={bookRowHoverKey(linkUnit, salt, i)}
            // The roll turns the box about its own centre, so its lowest
            // corner is at −[(h/2)·cos θ + (w/2)·|sin θ|], not −h/2. An earlier
            // `item.h / 2` dropped the second term and drove one bottom corner
            // of every rolled spine into the wood — the same class of error
            // that put fourteen leaning prints off their surfaces. This lands
            // the corner exactly on the plank: no sink, no float.
            base={[
              item.x,
              (item.h / 2) * Math.cos(spineRoll(i, salt)) +
                (item.w / 2) * Math.abs(Math.sin(spineRoll(i, salt))),
              (depths[i]! - 0.3) / 2,
            ]}
            lift={SPINE_LIFT}
            rest={[0, 0, spineRoll(i, salt)]}
            settle={SPINE_SETTLE}
            grabbable={grabbableVolumes}
            shadeColor={palette.shadow}
          >
            <SpineTip
              name={bookRowNodeName("spine", linkUnit, salt, i)}
              height={item.h}
              depth={depths[i]!}
            >
              <UprightBookVolume
                width={item.w}
                height={item.h}
                depth={depths[i]!}
                color={item.color}
                pages={palette.pages}
                roughness={0.55 + rand(i, salt + 6) * 0.35}
              />
              {/* Printing. DETAIL_MIN_W rather than the old 0.09: at 0.09
                  only the fat family carried any mark at all, so a row read as
                  two or three printed books standing in a block of blanks.
                  Variant 0 is deliberately empty, so about a sixth of the row
                  still has nothing on it. */}
              {item.w >= DETAIL_MIN_W && (
                <mesh position={[0, 0, depths[i]! / 2 + 0.001]}>
                  <planeGeometry args={[item.w * 0.9, item.h * 0.94]} />
                  <meshStandardMaterial
                    map={spineDetailTexture(
                      palette.ink,
                      Math.floor(rand(i, salt + 8) * 6),
                    )}
                    transparent
                    depthWrite={false}
                    roughness={0.7}
                  />
                </mesh>
              )}
            </SpineTip>
          </ShelfBook>
        ) : item.kind === "flat" ? (
          // Each volume in the horizontal stack is its own door, for the same
          // reason as BookPile: a shared hoverKey lifted the whole stack as
          // one slab.
          <group key={i}>
            {item.colors.map((color, j) => {
              const height = item.height ?? 0.052;
              return (
                <ShelfBook
                  key={j}
                  linkUnit={linkUnit}
                  to={to}
                  hoverKey={bookRowHoverKey(linkUnit, salt, i, j)}
                  // The first centre is one exact half-height above the plank;
                  // each height step then leaves adjacent boards touching.
                  base={[
                    item.x + j * (item.staggerX ?? 0.012),
                    height / 2 + j * height,
                    0,
                  ]}
                  lift={FLAT_LIFT}
                  grabbable={grabbableVolumes}
                  shadeColor={palette.shadow}
                >
                  <group
                    name={bookRowNodeName("flat", linkUnit, salt, i, j)}
                    rotation={[0, rand(i + j, salt + 9) * 0.16 - 0.08, 0]}
                  >
                    <FlatBookVolume
                      width={item.width ?? 0.32}
                      height={height}
                      depth={item.depth ?? 0.24}
                      color={color}
                      pages={palette.pages}
                    />
                  </group>
                </ShelfBook>
              );
            })}
          </group>
        ) : item.kind === "lean" ? (
          // Contact: rotZ drops one bottom corner — lift by the exact
          // h/2·cos + w/2·sin so the corner stays on the wood.
          <ShelfBook
            key={i}
            linkUnit={linkUnit}
            to={to}
            hoverKey={bookRowHoverKey(linkUnit, salt, i)}
            base={[
              item.x,
              (item.h / 2) * Math.cos(LEAN) + (item.w / 2) * Math.sin(LEAN),
              (depths[i]! - 0.3) / 2,
            ]}
            lift={SPINE_LIFT}
            grabbable={grabbableVolumes}
            shadeColor={palette.shadow}
          >
            {/* The authored lean lives on a wrapping group so the named inner
                node stays useful to the interaction probe. The parent Lift
                translates both together and never changes this rest pose. */}
            <group rotation={[0, 0, LEAN]}>
              <SpineTip
                name={bookRowNodeName("lean", linkUnit, salt, i)}
                height={item.h}
                depth={depths[i]!}
              >
                <UprightBookVolume
                  width={item.w}
                  height={item.h}
                  depth={depths[i]!}
                  color={item.color}
                  pages={palette.pages}
                  roughness={0.65}
                />
                {item.w >= DETAIL_MIN_W && (
                  <mesh position={[0, 0, depths[i]! / 2 + 0.001]}>
                    <planeGeometry args={[item.w * 0.9, item.h * 0.94]} />
                    <meshStandardMaterial
                      map={spineDetailTexture(
                        palette.ink,
                        Math.floor(rand(i, salt + 8) * 6),
                      )}
                      transparent
                      depthWrite={false}
                      roughness={0.7}
                    />
                  </mesh>
                )}
              </SpineTip>
            </group>
          </ShelfBook>
        ) : (
          <FirstCoverArrival
            key={item.key}
            progress={i === 0 ? firstCoverArrivalProgress : undefined}
          >
            <FeaturedCover
              item={item}
              palette={palette}
              textured={textured}
              coverWidth={coverWidth}
              onCoverClick={onCoverClick}
              linkUnit={linkUnit}
              to={to}
              grabbable={grabbableCovers}
              grabbableRiser={grabbableVolumes}
              riserColor={
                item.color ??
                palette.spines[
                  Math.floor(rand(i, salt + 14) * palette.spines.length)
                ]!
              }
            />
          </FirstCoverArrival>
        ),
      )}
    </group>
  );
}

function FirstCoverArrival({
  progress,
  children,
}: {
  progress?: () => number;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  useUnitFrame(() => {
    if (group.current)
      group.current.position.z = progress ? -0.11 * (1 - progress()) : 0;
  });
  return <group ref={group}>{children}</group>;
}

/** The two shelf surfaces in unit-local y. Both content groups sit AT the
 * wood, so every prop's local y=0 IS its contact plane — the two competing
 * offset conventions that made half the props float are gone. */
export const SHELF = SHELF_SURFACE;

// Palette-locked tiling wood grain — long streaks + rare knots drawn over
// the theme's wood hex, doubling as a subtle roughness map (its green
// channel carries the streak variation). Cached per hex × orientation;
// theme flips just switch cache entries.
const woodTextureCache = new Map<string, THREE.CanvasTexture>();
function woodGrainTexture(hex: string, vertical: boolean): THREE.CanvasTexture {
  const key = `${hex}|${vertical ? "v" : "h"}`;
  const hit = woodTextureCache.get(key);
  if (hit) return hit;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 42; i++) {
    const y = rand(i, 301) * size;
    const dark = rand(i, 302) > 0.45;
    ctx.strokeStyle = dark
      ? `rgba(0, 0, 0, ${0.04 + rand(i, 303) * 0.07})`
      : `rgba(255, 240, 210, ${0.03 + rand(i, 304) * 0.05})`;
    ctx.lineWidth = 0.8 + rand(i, 305) * 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, y);
    for (let x = 0; x <= size + 16; x += 16) {
      ctx.lineTo(
        x,
        y + Math.sin(x * 0.02 + i * 3.7) * 2.4 + rand(i + x, 306) * 1.6 - 0.8,
      );
    }
    ctx.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const cx = rand(k, 307) * size;
    const cy = rand(k, 308) * size;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.10)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      5 + rand(k, 309) * 7,
      2.2 + rand(k, 310) * 2.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (vertical) {
    texture.rotation = Math.PI / 2;
    texture.center.set(0.5, 0.5);
  }
  texture.anisotropy = 4;
  woodTextureCache.set(key, texture);
  return texture;
}

/** Plank/strap material with grain + per-unit tone jitter. The map carries
 * the palette hex, so `color` is just the ±4% scalar. */
function WoodMaterial({
  hex,
  tone = 1,
  vertical = false,
  repeat,
  roughness = 0.72,
}: {
  hex: string;
  tone?: number;
  vertical?: boolean;
  repeat: [number, number];
  roughness?: number;
}) {
  const { map, color } = useMemo(() => {
    const base = woodGrainTexture(hex, vertical);
    const map = base.clone();
    map.needsUpdate = true;
    map.repeat.set(repeat[0], repeat[1]);
    return { map, color: new THREE.Color(tone, tone, tone) };
  }, [hex, vertical, repeat[0], repeat[1], tone]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <meshStandardMaterial
      map={map}
      roughnessMap={map}
      color={color}
      roughness={roughness}
    />
  );
}

/** Housing charcoal. Deliberately NOT from the palette: in light theme the
 * planks are #a5845f and a fixture tinted to match them disappears, which is
 * the exact way a lit strip reads as nothing against a bright shelf. The
 * housing is the contrast; the emissive line is the light. */
const FIXTURE_BODY = "#2f2822";
const FIXTURE_GLOW = "#ffcf9e";
/** One shared box for all 21 fixtures — the mesh scales it. */
const barGeometry = new THREE.BoxGeometry(1, 1, 1);

/** A shelf's own light fixture.
 *
 * `y` is the unit-local height of the surface it mounts to. In the default
 * `under` form that is the UNDERSIDE of the plank overhead and the bar hangs
 * 13mm below it — measured, not guessed: the camera sits 2.24° above the
 * shelf line, so the sight line grazing the top plank's front lip drops to
 * y −0.0554 by the time it reaches z −0.20, and a bar whose lowest point is
 * y −0.0475 stays 8mm inside that shadow. The camera therefore never catches
 * the fixture edge-on, which is the failure that turns an under-shelf light
 * into a black bar. What you see instead is the spill below the plank edge.
 *
 * The TOP shelf has no plank above it, so `form="back"` stands the same bar
 * on the plank's back lip (z −0.402, clear of the deepest prop in the world
 * by 25mm) where it reads as a warm line behind everything on the shelf.
 *
 * Cost: the world cannot afford a real light per shelf — three.js bakes the
 * light counts into every program and there is no per-object culling, so 14
 * more pointLights would recompile all 43 programs and evaluate on every lit
 * pixel forever. So a fixture is an emissive bar plus one stretched glow
 * sprite by default, and only `cast` adds an actual pointLight. */
export function ShelfLight({
  y,
  width,
  palette,
  on = true,
  form = "under",
  z,
  /** Adds ONE pointLight. Budgeted at one per unit, not one per shelf. */
  cast = false,
  realLightVisible = true,
  lightUnitIndex,
  /** Scales the emissive, the glow and the light together. */
  intensity = 1,
  factorRef,
}: {
  y: number;
  width: number;
  palette: Palette;
  on?: boolean;
  form?: "under" | "back";
  z?: number;
  cast?: boolean;
  realLightVisible?: boolean;
  lightUnitIndex?: number;
  intensity?: number;
  /** Imperative electrical factor owned by the shelf's shared shock bank. */
  factorRef?: { current: number };
}) {
  const back = form === "back";
  const zz = z ?? (back ? -0.402 : -0.2);
  // The back bar has to earn its own contrast. The whole top-plank surface
  // subtends only ~8.5px at this camera (0.827 of depth at 2.24°), so a 3px
  // fixture there is a rounding error in light theme however hot its face is;
  // 0.042 gives it 11px of charcoal body with the lit line inside it, which
  // is a fixture in daylight and a strip of light after dark.
  const h = back ? 0.042 : 0.013;
  const depth = back ? 0.036 : 0.05;
  const cy = back ? y + h / 2 : y - h / 2;
  const barW = width * (back ? 0.9 : 0.84);
  const k = on ? intensity : 0;
  // A light is what it does to the room, and the room is twice as bright in
  // one theme as the other. Dark theme reads the additive halo and almost
  // nothing else; light theme's sky swallows the halo whole (glowOpacity is
  // 0.22 against dark's 0.55, then the composer halves it again) and only the
  // warm cast on the spines survives against a neutral key. So the two
  // channels trade places rather than both running at one setting.
  const day = palette !== PALETTES.dark;
  const glow = palette.glowOpacity * (day ? 1.15 : 0.5) * intensity;
  const lamp = (day ? 2.2 : 0.6) * k;
  return (
    <group>
      <mesh
        geometry={barGeometry}
        position={[0, cy, zz]}
        scale={[barW, h, depth]}
      >
        <meshStandardMaterial
          color={FIXTURE_BODY}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>
      {/* The lit face: down out of the housing in the under form, forward off
          its front in the back form. toneMapped false keeps it over Bloom's
          0.95 threshold, so on desktop the composer grows the falloff. */}
      <mesh
        geometry={barGeometry}
        position={
          back ? [0, cy, zz + depth / 2 + 0.001] : [0, cy - h / 2 - 0.001, zz]
        }
        scale={
          back
            ? [barW * 0.96, h * 0.42, 0.002]
            : [barW * 0.96, 0.002, depth * 0.6]
        }
      >
        <meshStandardMaterial
          color="#fff1d6"
          emissive={FIXTURE_GLOW}
          emissiveIntensity={3.2 * k}
          toneMapped={false}
        />
      </mesh>
      {/* The spill. One radial sprite stretched into a long ellipse — the
          plank in front of it depth-tests away the top half, so what survives
          is a warm smear hugging the shelf, which is all an under-shelf light
          ever looks like. Non-uniform scale on the parent works because
          three's sprite shader reads scale off the world matrix per axis. */}
      {k > 0 && (
        <group
          position={[0, back ? y + 0.045 : y - 0.03, zz + 0.08]}
          // The back bar's halo is kept TIGHT (0.17 against the under-plank
          // 0.42). Spread over the sky it is a haze band with a slope change
          // in it, which is the Mach band GlowSprite's own comment was
          // written to kill; squeezed onto the fixture it is a lit line.
          scale={[barW, back ? 0.17 : 0.42, 1]}
        >
          <GlowSprite opacity={glow} scale={1} factorRef={factorRef} />
        </group>
      )}
      {cast && (
        <pointLight
          visible={realLightVisible}
          userData={
            lightUnitIndex === undefined
              ? undefined
              : sceneUnitLightUserData(lightUnitIndex)
          }
          position={[0, back ? y + 0.06 : y - 0.06, zz + 0.14]}
          color={FIXTURE_GLOW}
          intensity={lamp}
          distance={1.6}
          decay={2}
        />
      )}
    </group>
  );
}

function ShelfLightBank({
  unitIndex,
  width,
  palette,
  realLightVisible,
}: {
  unitIndex?: number;
  width: number;
  palette: Palette;
  realLightVisible: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const factor = useRef(1);
  const previousFactor = useRef(1);
  const handledSceneImpulse = useRef(getSceneImpulse().revision);
  const shockAge = useRef<number | null>(null);
  const shockStrength = useRef(0);
  const world = useMemo(() => new THREE.Vector3(), []);
  useUnitFrame((_, delta) => {
    const lights = group.current;
    if (!lights) return;
    const sceneImpulse = getSceneImpulse();
    if (handledSceneImpulse.current !== sceneImpulse.revision) {
      handledSceneImpulse.current = sceneImpulse.revision;
      if (sceneImpulse.palette === "coordination") {
        lights.getWorldPosition(world);
        const strength = sceneImpulseStrengthAt(sceneImpulse, world);
        if (strength > 0) {
          shockStrength.current = Math.min(1, strength * 1.35);
          shockAge.current = 0.025;
        }
      }
    }
    let nextFactor = 1;
    if (shockAge.current !== null) {
      nextFactor = sceneImpulseLightScale(
        shockAge.current,
        shockStrength.current,
      );
      shockAge.current += Math.min(delta, 1 / 30);
      if (shockAge.current >= SCENE_IMPULSE_LIGHT_DURATION) {
        shockAge.current = null;
        shockStrength.current = 0;
      }
    }
    factor.current = nextFactor;
    if (Math.abs(nextFactor - previousFactor.current) < 0.001) return;
    const captureBase = previousFactor.current === 1 && nextFactor < 1;
    lights.traverse((object) => {
      if (object instanceof THREE.Light) {
        const data = object.userData as { shelfShockBase?: number };
        if (captureBase || data.shelfShockBase === undefined)
          data.shelfShockBase = object.intensity;
        object.intensity = data.shelfShockBase * nextFactor;
        return;
      }
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
        return;
      const material: unknown = object.material;
      if (
        !(material instanceof THREE.MeshStandardMaterial) ||
        (material.emissive.getHex() === 0 &&
          material.userData.shelfShockBase === undefined)
      )
        return;
      const data = material.userData as { shelfShockBase?: number };
      if (captureBase || data.shelfShockBase === undefined)
        data.shelfShockBase = material.emissiveIntensity;
      material.emissiveIntensity = data.shelfShockBase * nextFactor;
    });
    previousFactor.current = nextFactor;
  });
  return (
    <group ref={group} name={`shelf-light-bank:${unitIndex ?? "shared"}`}>
      <ShelfLight
        y={SHELF_UNDERSIDE.top}
        width={width}
        palette={palette}
        cast
        realLightVisible={realLightVisible}
        lightUnitIndex={unitIndex}
        factorRef={factor}
      />
      <ShelfLight
        y={SHELF_UNDERSIDE.lower}
        width={width}
        palette={palette}
        intensity={0.7}
        factorRef={factor}
      />
      <ShelfLight
        y={SHELF.top}
        width={width}
        palette={palette}
        form="back"
        intensity={0.85}
        factorRef={factor}
      />
    </group>
  );
}

function RegisteredShelfPlank({
  activeUnit,
  palette,
  plank,
  tone,
  width,
}: {
  activeUnit: number | null;
  palette: Palette;
  plank: (typeof SHELF_PLANKS)[number];
  tone: number;
  width: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  useEffect(() => {
    if (activeUnit === null || !mesh.current) return;
    return registerSceneInteraction({
      id: shelfPerchOwnerId(activeUnit, plank.id),
      root: mesh.current,
      activeUnits: [activeUnit],
      touchable: false,
      hover: { kind: "none" },
    });
  }, [activeUnit, plank.id]);
  return (
    <>
      <RoundedBox
        ref={mesh}
        userData={{ physicsIgnore: true }}
        castShadow
        receiveShadow
        args={[width, plank.thickness, plank.depth]}
        radius={0.012}
        smoothness={4}
        position={[0, plank.centerY, plank.centerZ]}
      >
        <WoodMaterial
          hex={palette.wood}
          tone={tone}
          repeat={[2.4, plank.id === "top" ? 1 : 0.8]}
        />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          userData={{ physicsIgnore: true }}
          position={[side * (width / 2 - 0.006), plank.centerY, plank.centerZ]}
        >
          <boxGeometry
            args={[0.013, plank.thickness + 0.002, plank.depth + 0.01]}
          />
          <meshStandardMaterial color={palette.woodDark} roughness={0.85} />
        </mesh>
      ))}
    </>
  );
}

export function ShelfUnit({
  children,
  lower,
  palette,
  width = SHELF_GEOMETRY.width,
  toneSeed,
}: {
  children?: React.ReactNode;
  lower?: React.ReactNode;
  palette: Palette;
  width?: number;
  /** Unit index — seeds a ±4% wood tone jitter so seven identical units
   * read as seven planks of the same lumber order, not one copy-paste. */
  toneSeed?: number;
}) {
  const unitRealLights = useUnitRealLights(toneSeed ?? -100);
  const tone = toneSeed === undefined ? 1 : 0.96 + rand(toneSeed, 77) * 0.08;
  const topContents = useRef<THREE.Group>(null);
  const lowerContents = useRef<THREE.Group>(null);
  return (
    <group>
      {process.env.NODE_ENV !== "production" && toneSeed !== undefined && (
        <ShelfSpacingProbe
          unitIndex={toneSeed}
          top={topContents}
          lower={lowerContents}
          halfWidth={width / 2}
        />
      )}
      <StaticWorldRoot id={`shelf-structure:${toneSeed ?? "shared"}`}>
        {SHELF_PLANKS.map((plank) => (
          <RegisteredShelfPlank
            key={plank.id}
            activeUnit={toneSeed ?? null}
            palette={palette}
            plank={plank}
            tone={tone}
            width={width}
          />
        ))}
        {/* Straps run all the way to the shared ground plane with a small
            plinth foot — the bookcase stands instead of hovering. */}
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[
              side * (width / 2 - SHELF_GEOMETRY.strapInsetX),
              0,
              SHELF_GEOMETRY.strapZ,
            ]}
          >
            <RoundedBox
              castShadow
              args={[
                SHELF_GEOMETRY.support.width,
                -SHELF_GEOMETRY.groundY,
                SHELF_GEOMETRY.support.width,
              ]}
              radius={0.012}
              smoothness={4}
              position={[0, SHELF_GEOMETRY.groundY / 2, 0]}
            >
              <WoodMaterial
                hex={palette.strap}
                tone={tone}
                vertical
                repeat={[0.4, 3]}
                roughness={0.68}
              />
            </RoundedBox>
            <RoundedBox
              args={[
                SHELF_GEOMETRY.support.footWidth,
                SHELF_GEOMETRY.support.footHeight,
                SHELF_GEOMETRY.support.footDepth,
              ]}
              radius={0.008}
              smoothness={4}
              position={[0, SHELF_GEOMETRY.groundY + 0.025, 0]}
            >
              <meshStandardMaterial color={palette.strap} roughness={0.7} />
            </RoundedBox>
            <RoundedBox
              args={[
                SHELF_GEOMETRY.support.cleatWidth,
                SHELF_GEOMETRY.support.cleatHeight,
                SHELF_GEOMETRY.support.cleatDepth,
              ]}
              radius={0.008}
              smoothness={4}
              position={[0, SHELF_GEOMETRY.lower.centerY - 0.0575, 0]}
            >
              <meshStandardMaterial color={palette.strap} roughness={0.7} />
            </RoundedBox>
          </group>
        ))}
      </StaticWorldRoot>
      {/* One fixture per shelf, wired here rather than in the seven unit
          files so no shelf can be forgotten. Only ONE of the three owns a
          real light — the lower shelf, which is the darkest bay a visitor
          actually reads props off. The full-cost A/B has 21 scene lights;
          active-neighbour visibility keeps distant shelf lights out of the
          material shader without removing any visible fixture. */}
      <ShelfLightBank
        unitIndex={toneSeed}
        width={width}
        palette={palette}
        realLightVisible={toneSeed === undefined || unitRealLights}
      />
      <group ref={topContents} position={[0, SHELF.top, 0]}>
        {children}
      </group>
      <group ref={lowerContents} position={[0, SHELF.lower, 0]}>
        {lower}
      </group>
    </group>
  );
}

/** Three stacked books. `salt` varies rotation AND color order per unit so
 * the same pile never repeats across units (v3 reused it verbatim). Spacing
 * 0.066 = 0.06 book + 0.006 kiss; the page block sits INSIDE the covers
 * (centered, 0.044 of 0.06) peeking out only at fore-edge and front —
 * correct book anatomy (v3's block hung below the cover). */
export function BookPile({
  palette,
  x = 0,
  salt = 9,
  linkUnit,
  grabbable = false,
}: {
  palette: Palette;
  x?: number;
  salt?: number;
  /** Unit index — set it and the stack (never its contact shade, which stays
   * planted on the wood) becomes a door into the library. */
  linkUnit?: number;
  /** Loose display books can be carried while a clean tap still enters Book
   * Notes. Rows that physically support other books keep the fixed default. */
  grabbable?: boolean;
}) {
  // One link PER BOOK, not one for the stack. Wrapping the whole pile in a
  // single PropLink made three books rise together under the pointer, which
  // the owner clocked immediately as "some of the books hover in groups
  // rather than one-by-one" — the pile stopped reading as books and started
  // reading as one moulded object.
  const stack = palette.pile.map((_, i) => {
    // 0.026 = half height 0.03 sunk by ~radius/2 to bury the bevel rim.
    const base: [number, number, number] = [i * 0.02, 0.026 + i * 0.066, 0];
    const book = (
      <group rotation={[0, rand(i, salt) * 0.5 - 0.25, 0]}>
        <RoundedBox
          castShadow
          args={[0.46, 0.06, 0.32]}
          radius={0.008}
          smoothness={4}
        >
          <meshStandardMaterial
            color={palette.pile[(i + salt) % palette.pile.length]}
            roughness={0.8}
          />
        </RoundedBox>
        <RoundedBox
          args={[0.44, 0.044, 0.31]}
          radius={0.008}
          smoothness={4}
          position={[0.014, 0, 0.014]}
        >
          <meshStandardMaterial color={palette.pages} roughness={0.9} />
        </RoundedBox>
      </group>
    );
    return linkUnit === undefined ? (
      <group key={i} position={base}>
        {book}
      </group>
    ) : grabbable ? (
      <Grabbable
        key={i}
        unitIndex={linkUnit}
        hoverKey={`grab:pile:${linkUnit}:${salt}:${i}`}
        base={base}
        shadeColor={palette.shadow}
        shadeWidth={0.48}
        shape="box"
        massKg={0.72}
        to="books"
      >
        {book}
      </Grabbable>
    ) : (
      <PropLink
        key={i}
        unitIndex={linkUnit}
        to="books"
        hoverKey={`link:pile:${linkUnit}:${salt}:${i}`}
        base={base}
        lift={[0, 0.028, 0.025]}
      >
        {book}
      </PropLink>
    );
  });
  return (
    <group position={[x, 0, 0]}>
      {!grabbable && (
        <ContactShade
          color={palette.shadow}
          width={0.62}
          position={[0.02, 0.03, 0.02]}
        />
      )}
      {stack}
    </group>
  );
}

/** L-steel bookend — vertical plate + base tongue that slips under the end
 * books. `flip` mirrors it for the far end of a row. */
export function Bookend({
  palette,
  flip = false,
}: {
  palette: Palette;
  flip?: boolean;
}) {
  const s = flip ? -1 : 1;
  return (
    <group>
      {/* Depth 0.30, not 0.13. A bookend has to be at least as deep as the
          books it holds or the row leans over the top of it; the spines it
          stands against are 0.26–0.34 deep, so at 0.13 it was holding back
          the front third of a book and nothing else. */}
      <RoundedBox
        castShadow
        args={[0.012, 0.21, 0.3]}
        radius={0.003}
        smoothness={2}
        position={[0, 0.105, 0]}
      >
        <meshStandardMaterial
          color={palette.metal}
          metalness={0.4}
          roughness={0.35}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.09, 0.008, 0.3]}
        radius={0.003}
        smoothness={2}
        position={[s * 0.048, 0.004, 0]}
      >
        <meshStandardMaterial
          color={palette.metal}
          metalness={0.4}
          roughness={0.35}
        />
      </RoundedBox>
    </group>
  );
}

// Bulb halo. The old two-stop gradient ended its ramp with a hard slope
// change at the disc edge, and a slope change in a shallow gradient is a
// Mach band — at lamp scale that printed as a visible circle in the sky,
// which is what the owner saw and called "this line in the background".
// These stops trace a gaussian and arrive at the rim with a near-zero
// derivative, so the halo has no edge to find.
let glowTextureCache: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTextureCache) return glowTextureCache;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  for (const [stop, a] of [
    [0, 1],
    [0.12, 0.82],
    [0.24, 0.56],
    [0.36, 0.34],
    [0.5, 0.17],
    [0.64, 0.072],
    [0.78, 0.024],
    [0.9, 0.005],
    [1, 0],
  ] as const) {
    grad.addColorStop(stop, `rgba(255, 186, 112, ${a})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  glowTextureCache = new THREE.CanvasTexture(canvas);
  return glowTextureCache;
}

/** A cheap bloom shoulder tied to the source that emits it. Unlike a Sprite,
 * this plane keeps the aperture's orientation, so an angled lamp produces a
 * foreshortened ellipse instead of a camera-facing light sphere. The texture
 * is shared with legacy glows; only this tiny plane and its material are new. */
export function ApertureHalo({
  diameter,
  opacity: baseOpacity,
  factorRef,
}: {
  diameter: number;
  opacity: number;
  factorRef?: { current: number };
}) {
  const ref =
    useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const settings = useScenePerformanceSettings();
  const visible = practicalGlowHaloEnabled(settings);
  const bloomActive = useStacks((state) => state.bloomActive);
  // If genuine bloom is enabled, leave only a faint source shoulder for it to
  // spread. A debug skip or direct-render fallback restores the full analytic
  // shoulder immediately.
  const opacity = visible ? baseOpacity * (bloomActive ? 0.38 : 1) : 0;
  const texture = useMemo(() => glowTexture(), []);
  useUnitFrame(() => {
    const halo = ref.current;
    if (!halo) return;
    halo.material.opacity = opacity * (factorRef?.current ?? 1);
  });
  return (
    <mesh
      ref={ref}
      visible={visible}
      scale={[diameter, diameter, 1]}
      userData={{ stacksSelfDimmed: true }}
    >
      <planeGeometry />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        depthTest
        depthWrite={false}
      />
    </mesh>
  );
}

export function GlowSprite({
  opacity: baseOpacity,
  eased = false,
  scale = 1.6,
  factorRef,
  practical = false,
}: {
  opacity: number;
  /** Damp opacity by lateral camera distance — an additive sprite over the
   * bright light-theme sky blows out to pure white mid-travel. */
  eased?: boolean;
  scale?: number;
  /** Per-frame 0..1 multiplier read imperatively (the lamp-toggle egg) —
   * never route it through React state. */
  factorRef?: { current: number };
  /** Practical fixtures default to a source-aligned analytic halo. This flag
   * lets diagnostics restore their former camera-facing billboard. */
  practical?: boolean;
}) {
  const ref = useRef<THREE.Sprite>(null);
  // Additive glow COMPOUNDS in the composer's linear HDR target (pre-
  // tonemap values ride the ACES shoulder) — halve it there or the lamp
  // reads as an orange searchlight.
  const postfx = useStacks((s) => s.postfx);
  const performanceSettings = useScenePerformanceSettings();
  const visible = !practical || practicalGlowSpriteEnabled(performanceSettings);
  const opacity = visible ? baseOpacity * (postfx ? 0.45 : 1) : 0;
  const texture = useMemo(() => glowTexture(), []);
  const world = useMemo(() => new THREE.Vector3(), []);
  useUnitFrame(({ camera }) => {
    const sprite = ref.current;
    if (!sprite || (!eased && !factorRef)) return;
    let value = opacity;
    if (eased) {
      sprite.getWorldPosition(world);
      const focus = Math.max(
        0,
        1 - Math.abs(camera.position.x - world.x) / 4.4,
      );
      value *= 0.3 + 0.7 * focus;
    }
    sprite.material.opacity = value * (factorRef?.current ?? 1);
  });
  return (
    <sprite ref={ref} visible={visible} scale={[scale, scale, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  );
}

/* ---------------------------------------------------------------------- *
 * The desk lamp's shade, measured off desk-lamp.glb.
 *
 * v6: THE RIG WAS ON THE WRONG HOLE, and everything the owner reported about
 * this lamp follows from that one fact.
 *
 * The v4.7 note that stood here was right about the method and wrong about
 * which answer it had found. The shade is island #5 of the single mesh (110
 * triangles, y 0.2777…0.4163), and it has exactly ONE boundary edge loop:
 * 16 points, centre [0, 0.3989, 0.0107], radius 0.0336, sd 0.0000. That loop
 * was taken to be the shade's mouth. It is the VENT at the narrow end — the
 * little hole at the top-back of an angle-poise head, where the arm comes in.
 *
 * The real mouth has no boundary loop precisely because it is the good end:
 * the rim is doubled (an outer wall at r 0.0562 folding to an inner wall at
 * r 0.0524), so every edge there is used by two triangles and an edge-loop
 * search cannot see it. Walking the island's radius along the axis finds it
 * immediately — 16 verts at r 0.0336 at t 0, 32 verts at r 0.0543 at t 0.1100
 * — and the bulb (island #6, 158 tris) sits at t 0.045…0.111, i.e. filling
 * the shade right up to that plane. A bulb is at the wide end of a shade.
 *
 * So the whole rig — emissive disc, spotlight, halo, both points — has been
 * sitting 0.1100 of model space (0.171 world at the shipped 1.55) up the axis
 * from the opening, at 62% of its diameter, tucked into the vent behind the
 * arm. That is exactly the report: the shade is unlit black plastic (nothing
 * warm is anywhere near the fabric you can see), the light does not appear to
 * come out of anything (the source is inside the head, pointed at its own
 * lining), and the pool is a hard ellipse thrown too far forward (the spot
 * starts 17 cm higher and further back than the mouth it is supposed to leave).
 *
 * All five numbers below are measured, and they are stated as a mouth-relative
 * frame on purpose: `along(t)` walks the axis from the mouth, so every
 * position in the rig reads as a distance out of (or back into) the opening
 * rather than as a literal, and moving one cannot leave the others behind.
 * ---------------------------------------------------------------------- */
/** The opening light actually leaves by — DERIVED from the vent and the axis
 * rather than written down again. The two ends of one cone are one
 * measurement, and this file's recurring bug is the second copy of a number
 * that stops agreeing with the first. */
const MOUTH: [number, number, number] = [...DESK_LAMP_MOUTH];
const MOUTH_R = DESK_LAMP_MOUTH_RADIUS;
/** Rotation about X that lays circleGeometry's +Z normal onto AXIS. */
const MOUTH_TILT = DESK_LAMP_MOUTH_TILT;

/** A point `t` out of the mouth along the shade's axis (negative = back up
 * inside the shade). Every position in the rig goes through this. */
const along = (t: number): [number, number, number] => [
  ...deskLampPointAlongAxis(t),
];

/** The desk lamp's light.
 *
 * v4.4's rule still holds and is the reason this rig looks the way it does:
 * nothing here draws light except things that are actually light. Three
 * earlier versions FAKED it with geometry (a bulb sphere, a gradient beam
 * cone, a one-world-unit additive haze) and every fake read as a decal the
 * moment the camera moved off-axis. So: a SpotLight down the true cup axis
 * makes the pool, a small emissive disc seals the mouth, the ModelProp's exact
 * shade surface carries the fabric glow, and two weak points put spill on the
 * shelf and neighboring props. The old camera-facing halo is retained only as
 * a diagnostics comparison; the shipped treatment feathers the aperture in
 * its own plane instead of drawing a separate light sphere.
 *
 * The one light this rig no longer spends is the interior one. It used to sit
 * 0.03 back up the axis to make the cup glow — the job the exact-surface shade
 * treatment now does for no light at all — and there is nowhere safe to put it:
 * the bulb island fills t 0.045…0.111, so a point light inside this shade is
 * always a few millimetres from geometry, which is the blown-hotspot failure
 * the table lamp on Musings is currently exhibiting. It is respent on the
 * room. The count is unchanged at three, which matters: three.js bakes light
 * counts into every program.
 *
 * `litRef` (the lamp-toggle egg's damped 0..1 factor) threads to the two
 * self-animating halo treatments. Lights, emissives, and the shade surface are
 * dimmed generically by the egg's traverse.
 *
 * NOTE ON STRUCTURE, and it is the point of the v6 pass: this rig no longer
 * takes a `yaw`. It used to, and the model took the same yaw separately, so
 * the shade's orientation was written down twice and could disagree. EggLamp
 * now carries the yaw AND the scale on the one group both the model and this
 * rig hang from, which is the only arrangement in which the rig cannot come
 * off the shade. `reach` remains, because a light's `distance` is a
 * world-space falloff radius that no parent transform touches. */
export function LampGlow({
  palette,
  litRef,
  reach = 1,
  aimOffset = [0, 0, 0],
  spillScale = 1,
  meadowId,
  realLights = true,
  unitIndex,
}: {
  palette: Palette;
  litRef?: { current: number };
  /** The shared parent's uniform scale. Positions ride it for free; light
   * `distance` does not, so it is the one number multiplied by hand.
   * Intensities are left alone: the lamp got bigger, not brighter. */
  reach?: number;
  /** Per-instance adjustment to the spot target, in the lamp's own measured
   * frame. The source stays registered to the shade mouth; only the cone aims
   * toward the objects that lamp is actually lighting. */
  aimOffset?: [number, number, number];
  /** Scale the two unshaped point-light fills independently of the spot. A
   * task lamp aimed at nearby metal needs the cone—not the bulb-adjacent
   * fill—to define the pool's brightest point. */
  spillScale?: number;
  /** Register this lamp's overspill with the unlit meadow (meadowLights).
   * The pool is anchored where the CONE lands, not under the base: the ray
   * from the mouth through the aim target is continued to the lawn plane,
   * so an angled task lamp warms the grass on the side it points at
   * (owner: "the grass light isn't factoring in the directionality"). */
  meadowId?: string;
  /** Hiding a Three light removes it from the renderer's light collection.
   * The emissive fixture, optional legacy GlowSprite, analytic meadow pool,
   * and moth volume remain mounted, so distant shelves lose no source
   * geometry. */
  realLights?: boolean;
  /** Owning shelf stop for bounded shader-variant warm-up. */
  unitIndex?: number;
}) {
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const day = palette !== PALETTES.dark;
  useEffect(() => {
    if (spotRef.current && targetRef.current)
      spotRef.current.target = targetRef.current;
    if (!meadowId || !spotRef.current || !targetRef.current) return;
    const mouth = new THREE.Vector3();
    const aim = new THREE.Vector3();
    spotRef.current.getWorldPosition(mouth);
    targetRef.current.getWorldPosition(aim);
    aim.sub(mouth);
    // Continue the beam to the lawn (y ≈ −1.1). A near-horizontal aim would
    // send the intersection to the horizon, so the throw is capped — past
    // that the overspill is too diffuse to anchor anywhere specific.
    const t = aim.y < -1e-3 ? Math.min((-1.1 - mouth.y) / aim.y, 5) : 2;
    return registerMeadowLamp(meadowId, {
      x: mouth.x + aim.x * t,
      y: -1.1,
      z: mouth.z + aim.z * t,
      radius: 1.15,
      strength: 0.45,
      litRef: litRef ?? { current: 1 },
      sourceX: mouth.x,
      sourceY: mouth.y,
      sourceZ: mouth.z,
      coneTargetX: mouth.x + aim.x * t,
      coneTargetY: -1.1,
      coneTargetZ: mouth.z + aim.z * t,
      // Two moths occupy the compact down-and-forward light cone rather than
      // circling at the shade mouth.
      mothCount: MOTH_LIGHT_PROFILES.desk.count,
      mothNearDistance: MOTH_LIGHT_PROFILES.desk.nearDistance,
      mothFarDistance: MOTH_LIGHT_PROFILES.desk.farDistance,
      mothMaxRadius: MOTH_LIGHT_PROFILES.desk.maxRadius,
    });
  }, [meadowId, litRef]);
  return (
    <group>
      {/* Reversible legacy comparison. Both current modes hide this
          camera-facing radial billboard; diagnostics can restore it at its
          last tuned size and position without disturbing the real rig. */}
      <group position={along(0.014)}>
        <GlowSprite
          practical
          opacity={palette.glowOpacity * (day ? 1.22 : 1.14)}
          eased
          scale={0.097}
          factorRef={litRef}
        />
      </group>
      {/* Performance bloom: a feathered plane just beyond the actual opening.
          It inherits the measured mouth rotation, so the shoulder becomes an
          ellipse at this camera rather than turning to face it like a ball. */}
      <group position={along(0.008)} rotation={[MOUTH_TILT, 0, 0]}>
        <ApertureHalo
          diameter={MOUTH_R * 2 * 1.8}
          opacity={palette.glowOpacity * (day ? 0.7 : 0.55)}
          factorRef={litRef}
        />
      </group>
      {/* Emissive disc ON the measured opening plane, a whisker inside the rim
          so it can never silhouette past the shade from any angle. It clears
          Bloom's 0.95 threshold, so on desktop the composer grows the soft
          falloff for us. DoubleSide because the mouth faces down-and-forward,
          away from a camera sitting above the shelf line — which is also why
          it is 2.0/1.1 and not the old flat 3.4: seen at ~26° off edge-on, a
          disc held that far over the threshold is three clipped white pixels
          rather than a warm source (the floor lamp's white-specks finding). */}
      <mesh position={MOUTH} rotation={[MOUTH_TILT, 0, 0]}>
        <circleGeometry args={[MOUTH_R * 0.94, 28]} />
        <meshStandardMaterial
          color="#fff1d6"
          emissive="#ffc98a"
          emissiveIntensity={day ? 1.7 : 2.5}
          roughness={0.4}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* The pool: a spot from just inside the mouth, down the true axis.
          7.5 → 4.3 is not a taste call either. The source moved 0.171 world
          closer to the plank, and the throw from mouth to wood fell from 0.674
          to 0.504, so the same intensity would have landed 1.79× the
          irradiance — a brighter, tighter version of the hard ellipse that was
          being complained about. 4.3 holds the old brightness; the angle opens
          and the penumbra goes to 0.95 to take the edge off it. */}
      <spotLight
        ref={spotRef}
        visible={realLights}
        userData={
          unitIndex === undefined
            ? undefined
            : sceneUnitLightUserData(unitIndex)
        }
        position={along(-0.005)}
        color="#ffbe73"
        intensity={day ? 5.6 : 4.8}
        angle={0.72}
        penumbra={0.95}
        distance={3.6 * reach}
        decay={2}
      />
      <object3D
        ref={targetRef}
        position={(() => {
          const target = along(1.2);
          return [
            target[0] + aimOffset[0],
            target[1] + aimOffset[1],
            target[2] + aimOffset[2],
          ] as [number, number, number];
        })()}
      />
      {/* Close spill: the shade's outside, the stalk and the wood right under
          the lamp. 0.114 world off the nearest rim at the shipped scale, which
          is the clearance a point light needs to stay a glow rather than a
          blown speck. */}
      <pointLight
        visible={realLights}
        userData={
          unitIndex === undefined
            ? undefined
            : sceneUnitLightUserData(unitIndex)
        }
        position={along(0.05)}
        color="#ffcf96"
        intensity={(day ? 0.82 : 0.66) * spillScale}
        distance={0.9 * reach}
        decay={2}
      />
      {/* Ambient kiss on the neighbouring props — the spot is a cone, so
          without this the objects a hand's width away sit in the dark next to
          a lit lamp, which is the one thing a real desk lamp never does. */}
      <pointLight
        visible={realLights}
        userData={
          unitIndex === undefined
            ? undefined
            : sceneUnitLightUserData(unitIndex)
        }
        position={along(0.16)}
        color="#ffbe73"
        intensity={(day ? 1.32 : 1.06) * spillScale}
        distance={1.9 * reach}
        decay={2}
      />
    </group>
  );
}

// Extruded disc with a REAL through-bore — the one feature no proxy mesh
// delivered (v3's cylinders read as "chocolate donuts", the v4 CC-BY dish
// read as dinnerware, per the owner). Real bumper ratio: 450mm disc,
// 50mm bore → hole r ≈ 0.112 × disc r.
const plateGeometryCache = new Map<string, THREE.ExtrudeGeometry>();
function plateGeometry(r: number, depth: number): THREE.ExtrudeGeometry {
  const key = `${r}|${depth}`;
  const hit = plateGeometryCache.get(key);
  if (hit) return hit;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r, 0, Math.PI * 2, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, r * 0.112, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 40,
  });
  geo.center();
  plateGeometryCache.set(key, geo);
  return geo;
}

/** Two rubber bumper plates leaning against the shelf back, steel hub
 * rings around the bore. Disc face lies in the extrude's xy plane, so
 * standing them up is the default orientation plus a lean. Rubber keeps
 * its albedo across themes, so the colors are constants, not palette.
 * `linkUnit` turns the pair into a door to the weightlifting log. */
export function BumperPlates({ linkUnit }: { linkUnit?: number }) {
  return (
    <group>
      {/* Radii are matched to the barbell's own plates rather than chosen:
          barbell.glb at its shelf-limited 0.73 puts a plate at 0.240 radius,
          so a loose plate on the shelf above has to be the same disc or the
          unit shows two different bumper plates in one glance. The pair keeps
          its old thickness:diameter ratio, so they grew as solids, not as
          discs. `z` stands the smaller plate in FRONT of the big one — at
          these radii they overlap in x by design (that is what leaning plates
          do), and without the depth offset they would occupy the same slab
          and interpenetrate. */}
      {[
        {
          r: 0.24,
          t: 0.0675,
          x: 0,
          z: 0,
          lean: 0.13,
          yaw: 0.14,
          color: "#8a4a30",
        },
        {
          r: 0.195,
          t: 0.06,
          x: 0.4,
          z: 0.09,
          lean: 0.18,
          yaw: -0.1,
          color: "#33302b",
        },
      ].map((p, i) => {
        // Contact for a leaning DISC, not a leaning plate-shaped box. The
        // solid is a cylinder of radius R about its face normal n, so its
        // reach below centre is H·|n.y| + R·√(1−n.y²) — the old
        // R·cos(lean) dropped the half-thickness term and buried the rim by
        // ~0.6cm, which the thicker v4.8 plates would have taken to 0.7.
        // Euler XYZ applies yaw before lean, so n.y = cos(yaw)·sin(lean).
        const R = p.r + 0.008; // bevelSize grows the silhouette
        const H = p.t / 2 + 0.008; // bevelThickness, both faces
        const ny = Math.cos(p.yaw) * Math.sin(p.lean);
        const contact = H * Math.abs(ny) + R * Math.sqrt(1 - ny * ny);
        const base: [number, number, number] = [p.x, contact, p.z];
        const disc = (
          <group rotation={[-p.lean, p.yaw, 0]}>
            <mesh castShadow geometry={plateGeometry(p.r, p.t)}>
              <meshStandardMaterial color={p.color} roughness={0.62} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[0, 0, side * (p.t / 2)]}>
                <torusGeometry args={[p.r * 0.112 + 0.0156, 0.01, 10, 28]} />
                <meshStandardMaterial
                  color="#8a8f94"
                  metalness={0.55}
                  roughness={0.35}
                />
              </mesh>
            ))}
          </group>
        );
        // One hoverKey PER DISC. The pair shared one, so the pointer lifted
        // both as a single 200×120px slab — the same failure BookPile's
        // comment documents and rejects, still live on this shelf.
        return linkUnit === undefined ? (
          <group key={i} position={base}>
            {disc}
          </group>
        ) : (
          <PropLink
            key={i}
            unitIndex={linkUnit}
            to="weightlifting"
            hoverKey={`link:plates:${linkUnit}:${i}`}
            base={base}
            // Iron doesn't leap — the smallest lift in the scene.
            lift={[0, 0.018, 0.015]}
          >
            {disc}
          </PropLink>
        );
      })}
    </group>
  );
}

export function FrameRow({
  frames,
  width,
  palette,
  textured = true,
  onFrameClick,
  unitIndex,
  focus = [0.5, 0],
  imageGrade = 0.08,
  grabbable = false,
}: {
  frames: { src: string; detailSrc?: string; key: string; href?: string }[];
  width: number;
  palette: Palette;
  textured?: boolean;
  onFrameClick?: (key: string) => void;
  /** Source-space focal point for cover-fit. Project screenshots keep their
   * top edge by default; callers can opt into another composition. */
  focus?: [number, number];
  /** Warm texture grade. App screenshots can opt out while photos retain it. */
  imageGrade?: number;
  /** Owning unit for diagnostics and authored scene relationships. Optional
   * only so call sites can adopt the shared interaction registry separately. */
  unitIndex?: number;
  /** Opt-in for freestanding screenshot frames. A tap preserves the frame's
   * destination; a >6px carry moves it without opening. */
  grabbable?: boolean;
}) {
  const setHovered = useStacks((s) => s.setHovered);
  return (
    <group>
      {frames.map(({ src, detailSrc, key, href }, i) => {
        // Frames at 0.76 wide on 2.6-row slots leave ~0.1 air between them;
        // per-frame yaw/roll jitter + a z-stagger kill the edge-to-edge
        // "thumbnail band" read. The roll drops one bottom corner, so the
        // base lifts by halfWidth·|roll| to keep that corner on the wood.
        const roll = (rand(i, 71) - 0.5) * 0.08;
        const yaw = (1 - i) * 0.05 + (rand(i, 73) - 0.5) * 0.12;
        const pitch =
          frames.length > 1 ? (width - 0.76) / (frames.length - 1) : 0;
        const x =
          (i - (frames.length - 1) / 2) * pitch + (rand(i, 74) - 0.5) * 0.05;
        const z = i % 2 === 0 ? -0.075 : -0.04;
        const base: [number, number, number] = [
          x,
          0.2445 + Math.abs(roll) * 0.4,
          z,
        ];
        const frame = (
          <group rotation={[-0.1, yaw, roll]}>
            <RoundedBox
              castShadow
              args={[0.76, 0.48, 0.035]}
              radius={0.008}
              smoothness={4}
              position={[0, 0, -0.02]}
            >
              <meshStandardMaterial color={palette.frame} roughness={0.6} />
            </RoundedBox>
            {textured ? (
              <React.Suspense fallback={null}>
                <LitImage
                  url={src}
                  detailUrl={detailSrc}
                  width={0.68}
                  height={0.4}
                  roughness={0.5}
                  grade={imageGrade}
                  position={[0, 0, -0.001]}
                  focus={focus}
                  onPointerOver={
                    grabbable
                      ? undefined
                      : (e) => {
                          e.stopPropagation();
                          setHovered(`frame:${key}`);
                        }
                  }
                  onPointerOut={
                    grabbable
                      ? undefined
                      : () => {
                          if (useStacks.getState().hovered === `frame:${key}`)
                            setHovered(null);
                        }
                  }
                  onClick={
                    !grabbable && onFrameClick && href
                      ? (e) => {
                          if ((e.delta ?? 0) > 6) return; // swipe, not a tap
                          e.stopPropagation();
                          onFrameClick(href);
                        }
                      : undefined
                  }
                />
              </React.Suspense>
            ) : (
              <mesh position={[0, 0, 0.001]}>
                <planeGeometry args={[0.68, 0.4]} />
                <meshStandardMaterial color={palette.cover} roughness={0.85} />
              </mesh>
            )}
          </group>
        );
        return grabbable && unitIndex !== undefined ? (
          <Grabbable
            key={key}
            unitIndex={unitIndex}
            hoverKey={`grab:frame:${key}`}
            base={base}
            shadeColor={palette.shadow}
            shadeWidth={0.82}
            shape="box"
            massKg={0.82}
            onTap={onFrameClick && href ? () => onFrameClick(href) : undefined}
            href={href}
            doorLabel={href ? `View ${key}` : undefined}
            external
          >
            {frame}
          </Grabbable>
        ) : (
          <Lift
            key={key}
            hoverKey={`frame:${key}`}
            base={base}
            offset={[0, 0.04, 0.03]}
          >
            {frame}
          </Lift>
        );
      })}
    </group>
  );
}
