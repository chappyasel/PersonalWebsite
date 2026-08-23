"use client";

// Physical forms for photographs in the scene. Artifact identity, full-size
// media, room-local collections, and source actions live in sceneArtifacts;
// this module only owns the shapes used to display each print on a shelf.
// Contact convention is the scene's: local y = 0 is the shelf wood, so a
// leaning prop sits at y = (height/2)·cos(lean).
//
// One shared caveat: LitImage's texture cache is keyed by URL and each
// instance mutates repeat/offset, so a given photo may appear EXACTLY ONCE
// in the scene. Reuse needs a clone first.
import { type Palette } from "../theme";
import React from "react";

import LitImage from "./LitImage";
import { RoundedBox } from "./RoundedBox";
import { deskFrameHeight, deskFrameWidth } from "./photoGeometry";

export { deskFrameHeight, deskFrameWidth } from "./photoGeometry";

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
  const w = deskFrameWidth(width);
  const h = deskFrameHeight(height);
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
            role="feature"
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
            role="support"
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
