"use client";

// The Sticker Camera — a small brushed-aluminium box camera that prints
// dithered black-and-white stickers. Two of them sit on the Talks shelf,
// which is the one shelf in the room where a camera is not decoration: every
// photograph around them is an event still.
//
// Built rather than downloaded because the shape is simple and specific, and
// because the room already owns its aluminium and its pixel-font vocabulary.
//
// SCALE IS MEASURED, NOT EYEBALLED. The real body is 2.90" wide × 3.64" tall
// × 1.35" deep, and the room runs at 2.00 units per metre (the bookcase's own
// joinery — see the Talks floor lamp note). Inches → metres → units is the
// only conversion here, so the camera stands correctly beside books and
// frames that are themselves at house scale.
import React, { useMemo } from "react";
import * as THREE from "three";

import { RoundedBox } from "../RoundedBox";

const INCH = 0.0254;
const UNITS_PER_METRE = 2;
const inches = (value: number) => value * INCH * UNITS_PER_METRE;

export const STICKER_CAMERA = {
  width: inches(2.9),
  height: inches(3.64),
  depth: inches(1.35),
} as const;

const HALF_W = STICKER_CAMERA.width / 2;
const HALF_H = STICKER_CAMERA.height / 2;
const HALF_D = STICKER_CAMERA.depth / 2;
/** Front face of the body, the plane every front detail is measured from. */
const FRONT = HALF_D;
const BACK = -HALF_D;

/** Bead-blasted aluminium: bright, but rough enough not to mirror the sky. */
const SHELL = "#c3c6c9";
const SHELL_DARK = "#8f9498";
const LENS_BLACK = "#111317";
const SHUTTER_RED = "#c0392b";

/** The wordmark, drawn once into a shared canvas. The real camera carries a
 * bitmap-font "sticker camera" lockup on the lower left of its face; at the
 * size this prop occupies on screen a texture reads as lettering where a
 * plain dark rectangle would read as a smudge.
 *
 * Transparent ground with dark glyphs, so the plane can sit straight on the
 * shell without carrying its own background colour. */
let wordmarkCache: THREE.CanvasTexture | null = null;
function wordmarkTexture(): THREE.CanvasTexture | null {
  if (wordmarkCache) return wordmarkCache;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0e1013";
  ctx.textBaseline = "middle";
  ctx.font = "bold 46px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText("sticker", 6, 26);
  ctx.fillText("camera", 6, 70);
  wordmarkCache = new THREE.CanvasTexture(canvas);
  wordmarkCache.anisotropy = 4;
  return wordmarkCache;
}

/** One camera. `tone` lets the pair differ very slightly, the way two units
 * off the same line do once they have been carried around. */
export default function StickerCamera({ tone = 1 }: { tone?: number }) {
  const wordmark = useMemo(() => wordmarkTexture(), []);
  const shell = useMemo(
    () => new THREE.Color(SHELL).multiplyScalar(tone).getStyle(),
    [tone],
  );
  return (
    <group>
      {/* Body. */}
      <RoundedBox
        castShadow
        args={[STICKER_CAMERA.width, STICKER_CAMERA.height, STICKER_CAMERA.depth]}
        radius={0.005}
        smoothness={3}
      >
        <meshStandardMaterial color={shell} roughness={0.44} metalness={0.55} />
      </RoundedBox>

      {/* The shell splits into two halves. A shallow dark band rather than a
          modelled gap: at this size a real seam is sub-pixel. */}
      <mesh position={[0, -HALF_H + inches(0.42), 0]}>
        <boxGeometry
          args={[
            STICKER_CAMERA.width + 0.0006,
            0.0022,
            STICKER_CAMERA.depth + 0.0006,
          ]}
        />
        <meshStandardMaterial
          color={SHELL_DARK}
          roughness={0.6}
          metalness={0.4}
        />
      </mesh>

      {/* Lens: a raised bezel ring with the black element inside it. The ring
          is a torus so the element is visible through it — a solid disc of
          bezel would simply cover the lens. */}
      <mesh position={[0, inches(0.42), FRONT + 0.006]}>
        <torusGeometry args={[inches(0.86), inches(0.1), 8, 28]} />
        <meshStandardMaterial color={shell} roughness={0.36} metalness={0.62} />
      </mesh>
      <mesh
        position={[0, inches(0.42), FRONT + 0.003]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[inches(0.82), inches(0.82), 0.006, 28]} />
        <meshStandardMaterial
          color={LENS_BLACK}
          roughness={0.22}
          metalness={0.3}
        />
      </mesh>
      {/* The pinhole itself, just off-centre like the real one. */}
      <mesh
        position={[0, inches(0.42), FRONT + 0.0065]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.0022, 0.0022, 0.001, 8]} />
        <meshStandardMaterial color="#05060a" roughness={0.5} />
      </mesh>

      {/* Wordmark, lower left of the face. */}
      {wordmark && (
        <mesh
          position={[
            -HALF_W + inches(0.78),
            -HALF_H + inches(0.78),
            FRONT + 0.0008,
          ]}
        >
          <planeGeometry args={[inches(1.36), inches(0.51)]} />
          <meshStandardMaterial
            map={wordmark}
            transparent
            roughness={0.7}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Knurled dial on the right cheek. flatShading on a coarse cylinder is
          the knurl: 22 facets read as milling at this size, and cost nothing
          next to real grooves. */}
      <mesh
        position={[HALF_W + inches(0.16), -inches(0.1), -inches(0.12)]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[inches(0.62), inches(0.62), inches(0.34), 22]} />
        <meshStandardMaterial
          color={shell}
          roughness={0.34}
          metalness={0.72}
          flatShading
        />
      </mesh>
      {/* Anodised face of the dial. */}
      <mesh
        position={[HALF_W + inches(0.34), -inches(0.1), -inches(0.12)]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[inches(0.5), inches(0.5), 0.002, 22]} />
        <meshStandardMaterial
          color="#5b4d92"
          roughness={0.22}
          metalness={0.85}
        />
      </mesh>

      {/* Red shutter slider on the top deck. */}
      <mesh
        position={[-HALF_W + inches(0.72), HALF_H + 0.0015, -inches(0.28)]}
      >
        <boxGeometry args={[inches(0.6), 0.004, inches(0.2)]} />
        <meshStandardMaterial
          color={SHUTTER_RED}
          roughness={0.45}
          metalness={0.15}
        />
      </mesh>

      {/* Back: the review screen and two of its controls. Mostly away from
          the room camera, so it stays cheap. */}
      <RoundedBox
        args={[inches(1.85), inches(2.2), 0.004]}
        radius={0.003}
        smoothness={2}
        position={[0, -inches(0.1), BACK - 0.0015]}
      >
        <meshStandardMaterial
          color={LENS_BLACK}
          roughness={0.3}
          metalness={0.2}
        />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * inches(1.0), HALF_H - inches(0.42), BACK - 0.002]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[inches(0.16), inches(0.16), 0.003, 10]} />
          <meshStandardMaterial
            color={SHELL_DARK}
            roughness={0.5}
            metalness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}
