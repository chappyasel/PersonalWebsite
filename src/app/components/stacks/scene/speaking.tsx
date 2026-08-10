"use client";

// The physical residue of a speaking life. Talks was the emptiest unit in the
// world by a wide margin — five placements against About's fifteen, four of
// them photographs, and one GLB in the entire unit. It read as a gallery wall
// with a lamp on it, and the frame row restates the placard's three cards
// one-for-one directly beside them, so half its visual weight was a
// duplicate.
//
// The fix is not a seventh photograph. It is objects: things you would
// actually own and leave on a shelf after speaking somewhere. Both of these
// are procedural, because both are cheaper to build than to find, and because
// the last imported prop this unit was given — a stand microphone — was
// killed at browse for reading "stupid and out of place". A mic is stage
// equipment. A tent card and a badge are what you take home.
import { useMemo } from "react";
import * as THREE from "three";

import { type Palette } from "../theme";

/** Shared canvas → texture helper. Both props print type, and both want the
 * same treatment: the site's serif, generous tracking, and small enough that
 * at travel distance it reads as the TEXTURE of type rather than as words —
 * which is what real printed matter does at three metres. */
function printedTexture(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  w: number,
  h: number,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/** The folded card that sits in front of you on a panel table.
 *
 * Chosen over every other speaking object because it is the only one that is
 * both unmistakable and a thing that SITS ON A SURFACE, which is what a shelf
 * needs — a microphone is thin wire geometry that aliases into dashes at this
 * scale, and a lectern is venue furniture nobody owns. The silhouette does
 * the work even when the name is illegible: a small folded card at a shelf
 * edge reads as "panel" from any angle.
 *
 * Sits at y = 0 on its two base edges, the scene's contact convention. */
export function TentCard({
  palette,
  name = "CHAPPY ASEL",
  width = 0.17,
  height = 0.095,
}: {
  palette: Palette;
  name?: string;
  width?: number;
  height?: number;
}) {
  const face = useMemo(
    () =>
      printedTexture(
        (ctx, w, h) => {
          ctx.fillStyle = "#f4efe4";
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = "#4a4036";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
                    // Letter-spaced by hand: canvas has no tracking, and a name set
          // solid at this size reads as a smudge.
          const spaced = name.split("").join(" ");
          // Fitted, because a spaced name at a fixed size overran the
          // card and the first pass printed "APPY AS" — canvas draws
          // straight past its own edge without complaining.
          let size = Math.round(h * 0.26);
          ctx.font = `${size}px Georgia, serif`;
          while (ctx.measureText(spaced).width > w * 0.84 && size > 8) {
            size -= 2;
            ctx.font = `${size}px Georgia, serif`;
          }
          ctx.fillText(spaced, w / 2, h * 0.5);
          ctx.strokeStyle = "#9a8d7c";
          ctx.lineWidth = Math.max(1, h * 0.018);
          ctx.beginPath();
          ctx.moveTo(w * 0.30, h * 0.76);
          ctx.lineTo(w * 0.70, h * 0.76);
          ctx.stroke();
        },
        512,
        288,
      ),
    [name],
  );
  // A shallow Λ. Each panel pivots at its base edge, so the pair meets at a
  // shared top and the card stands on two lines of contact rather than
  // hovering on one.
  const lean = 0.2;
  const y = (height / 2) * Math.cos(lean);
  const z = (height / 2) * Math.sin(lean);
  return (
    <group>
      {/* Front panel — leans back, carries the print. */}
      <mesh position={[0, y, z]} rotation={[-lean, 0, 0]}>
        <boxGeometry args={[width, height, 0.0026]} />
        <meshStandardMaterial map={face} roughness={0.86} />
      </mesh>
      {/* Back panel — plain card stock. */}
      <mesh position={[0, y, -z]} rotation={[lean, 0, 0]}>
        <boxGeometry args={[width, height, 0.0026]} />
        <meshStandardMaterial color={palette.paper} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** A conference badge lying face-up with its lanyard coiled beside it.
 *
 * ONE badge. A pile of them is an achievement display, which is the register
 * this site refuses everywhere else — and the venue printed on it is real,
 * taken from the speaking data, not invented.
 *
 * The lanyard is COILED rather than draped on purpose. A hanging strap is
 * thin geometry that aliases into dashes at shelf scale, the same way the
 * lamp legs do; a loose coil is a shape, and it holds at any distance. */
export function ConferenceBadge({
  palette,
  venue = "CONSENSUS",
  name = "Chappy Asel",
  cordColor,
}: {
  palette: Palette;
  venue?: string;
  name?: string;
  cordColor: string;
}) {
  const face = useMemo(
    () =>
      printedTexture(
        (ctx, w, h) => {
          ctx.fillStyle = "#f7f3ea";
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = "#2f2a24";
          ctx.fillRect(0, 0, w, h * 0.22);
          ctx.fillStyle = "#f2ede2";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `${Math.round(h * 0.10)}px Georgia, serif`;
          ctx.fillText(venue.split("").join(" "), w / 2, h * 0.115);
          ctx.fillStyle = "#3b3229";
          ctx.font = `${Math.round(h * 0.115)}px Georgia, serif`;
          ctx.fillText(name, w / 2, h * 0.45);
          ctx.strokeStyle = "#a99c8a";
          ctx.lineWidth = Math.max(1, h * 0.008);
          ctx.beginPath();
          ctx.moveTo(w * 0.22, h * 0.6);
          ctx.lineTo(w * 0.78, h * 0.6);
          ctx.stroke();
          // The slot the cord goes through — the detail that makes it a
          // badge rather than a business card.
          ctx.fillStyle = "#cfc6b6";
          ctx.fillRect(w * 0.42, h * 0.86, w * 0.16, h * 0.035);
        },
        360,
        512,
      ),
    [venue, name],
  );
  const cord = useMemo(() => {
    // Two loose turns of an ellipse, drifting slightly so it reads as
    // dropped rather than arranged, with the free end running under the
    // badge.
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 34; i++) {
      const t = (i / 34) * Math.PI * 4;
      const r = 0.052 - t * 0.0026;
      points.push(
        new THREE.Vector3(
          Math.cos(t) * r * 1.25 - 0.045,
          0.004 + Math.sin(t * 1.7) * 0.0016,
          Math.sin(t) * r,
        ),
      );
    }
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      52,
      0.0055,
      6,
      false,
    );
  }, []);
  // The badge STANDS, leaning back on its own coil.
  //
  // It was flat on the wood first, which is how a badge is actually left —
  // and at this camera's ~2° grazing angle a 0.09 × 0.128 card lying face-up
  // subtends about three pixels and reads as a smear. Exactly the geometry
  // that made the old ContactPools invisible. Anything meant to be READ in
  // this room has to face the viewer.
  const lean = 0.34;
  const h = 0.128;
  return (
    <group>
      <group
        position={[0, (h / 2) * Math.cos(lean), -(h / 2) * Math.sin(lean)]}
        rotation={[lean, 0, 0.06]}
      >
        <mesh position={[0, 0, 0.0012]}>
          <boxGeometry args={[0.09, h, 0.0022]} />
          <meshStandardMaterial map={face} roughness={0.82} />
        </mesh>
        {/* Card stock behind the print, so the badge is not a floating decal
            when the traverse swings it past edge-on. */}
        <mesh>
          <boxGeometry args={[0.093, h + 0.003, 0.0032]} />
          <meshStandardMaterial color={palette.paper} roughness={0.9} />
        </mesh>
      </group>
      <mesh geometry={cord}>
        <meshStandardMaterial color={cordColor} roughness={0.72} />
      </mesh>
    </group>
  );
}
