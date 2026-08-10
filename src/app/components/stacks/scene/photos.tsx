"use client";

// Photo props beyond the instant print. The shelves are getting a lot more
// photographs (owner: "significantly more pictures ... like 3-5 per
// section"), and seven identical polaroids in a row is a contact sheet, not
// a room. These give the placement pass three silhouettes to alternate:
// something framed and upright, something lying flat, something small and
// propped. Contact convention is the scene's: local y = 0 is the shelf
// wood, so a leaning prop sits at y = (height/2)·cos(lean).
//
// One shared caveat: LitImage's texture cache is keyed by URL and each
// instance mutates repeat/offset, so a given photo may appear EXACTLY ONCE
// in the scene. Reuse needs a clone first.
//
// PhotoMount lives here too — every print in the room, whatever its
// silhouette and whichever file it was declared in, hangs from it.
import { RoundedBox } from "@react-three/drei";
import React from "react";

import { INERT_HOVER } from "../store";
import { type Palette } from "../theme";
import PropLink, { HoverProp } from "./links";
import LitImage from "./LitImage";

const FRAME_BORDER = 0.024;

/** The photographs whose source post is known for certain — the tweet ID is
 * verbatim in the archive filename, so these four are traced, not inferred.
 *
 * Declared here rather than only at the call sites because the scene is
 * mouse-only: a WebGL canvas has no focus order and no accessible name, so
 * a link that exists only as a raycast target is unreachable by keyboard and
 * invisible to a screen reader. PlacardLayer mirrors this list into the DOM
 * as an sr-only nav. Import it; never retype a URL, or the two drift. */
export const PHOTO_SOURCES: { href: string; label: string }[] = [
  { href: "https://x.com/i/status/1742265325423337870", label: "Under the bar, mid-set" },
  { href: "https://x.com/i/status/1778892048747417620", label: "At the whiteboard" },
  { href: "https://x.com/i/status/1798370655718744491", label: "Hosting, mic in hand" },
  { href: "https://x.com/i/status/1835742939928240302", label: "Reading NOISE" },
];

/** A print rises about a centimetre and comes a little way toward you —
 * enough to catch the lamp, small enough that crossing a shelf of them
 * doesn't set the room twitching. */
const PHOTO_LIFT: [number, number, number] = [0, 0.012, 0.016];
/** ~3° off each axis of the placement tilt: the frame squares up to you
 * without ever looking like it snapped to a grid. */
const PHOTO_SETTLE = 0.05;
const PHOTO_GROW = 1.02;

/** Every photograph in the room mounts through here. It owns the print's
 * placement, because the hover can only ease a tilt it holds itself, and it
 * gates on the active unit so prints two units away don't take the cursor.
 * `href` is for the four frames whose source post is known verbatim. */
export function PhotoMount({
  unitIndex,
  id,
  position,
  rotation,
  lift = PHOTO_LIFT,
  href,
  children,
}: {
  unitIndex: number;
  /** The photo's file stem, or its path where the placement already has one
   * to hand. Either is unique by construction: LitImage's URL-keyed cache
   * already forbids hanging the same print twice. */
  id: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  lift?: [number, number, number];
  /** The post this photograph came from, when there is one. */
  href?: string;
  children: React.ReactNode;
}) {
  const pose = {
    unitIndex,
    base: position,
    lift,
    rest: rotation,
    settle: PHOTO_SETTLE,
    grow: PHOTO_GROW,
  };
  return href === undefined ? (
    <HoverProp {...pose} hoverKey={`${INERT_HOVER}${id}`}>
      {children}
    </HoverProp>
  ) : (
    <PropLink {...pose} hoverKey={`link:photo:${id}`} href={href}>
      {children}
    </PropLink>
  );
}

/** Total height of a DeskFrame — callers need it for the contact math. */
export function deskFrameHeight(height: number) {
  return height + FRAME_BORDER * 2;
}

/** A small standing frame: the grown-up sibling of the polaroid, for the
 * pictures that deserve to be framed rather than propped. Landscape by
 * default; pass a taller `height` for a portrait one. */
export function DeskFrame({
  src,
  palette,
  textured = true,
  width = 0.3,
  height = 0.22,
  zoom = 1,
  focus,
}: {
  src: string;
  palette: Palette;
  textured?: boolean;
  width?: number;
  height?: number;
  zoom?: number;
  focus?: [number, number];
}) {
  const w = width + FRAME_BORDER * 2;
  const h = height + FRAME_BORDER * 2;
  return (
    <group>
      <RoundedBox
        castShadow
        args={[w, h, 0.016]}
        radius={0.005}
        smoothness={3}
        position={[0, 0, -0.009]}
      >
        <meshStandardMaterial color={palette.frame} roughness={0.6} />
      </RoundedBox>
      {/* Mat, so the photo never runs to the frame's inner edge. */}
      <mesh position={[0, 0, -0.0008]}>
        <planeGeometry args={[width + 0.012, height + 0.012]} />
        <meshStandardMaterial color={palette.pages} roughness={0.9} />
      </mesh>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            width={width}
            height={height}
            roughness={0.55}
            zoom={zoom}
            focus={focus}
            position={[0, 0, 0.001]}
          />
        </React.Suspense>
      )}
    </group>
  );
}

/** A print lying face-up on the shelf, as if just set down. Every other
 * photo prop stands, so one flat one per shelf breaks the picket-fence
 * read and fills horizontal space that standing props can't. Position it
 * at the shelf surface (y = 0) and rotate about Y only. */
export function FlatPrint({
  src,
  palette,
  textured = true,
  width = 0.26,
  height = 0.19,
}: {
  src: string;
  palette: Palette;
  textured?: boolean;
  width?: number;
  height?: number;
}) {
  const border = 0.014;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <RoundedBox
        castShadow
        args={[width + border * 2, height + border * 2, 0.005]}
        radius={0.002}
        smoothness={2}
        position={[0, 0, 0.0025]}
      >
        <meshStandardMaterial color={palette.paper} roughness={0.88} />
      </RoundedBox>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            width={width}
            height={height}
            roughness={0.6}
            position={[0, 0, 0.0055]}
          />
        </React.Suspense>
      )}
    </group>
  );
}
