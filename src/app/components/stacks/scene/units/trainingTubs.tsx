"use client";

import Grabbable from "../Grabbable";
import React, { useMemo } from "react";
import * as THREE from "three";

import type { UnitProps } from "./types";

/** The two pre-workout tubs on the Training shelves. Both are authored
 * cylinders with a canvas label rather than the hexagonal protein GLB, so
 * the label actually wraps the body instead of poking through its flats.
 *
 * Gorilla Mode ships in a squat 800 g tub, about 14 cm across and 16 cm
 * tall, but it stands next to the 5 lb whey and at true size it read as a
 * mini. Owner call: a tad bigger than life, 0.355 high, so it holds its own
 * beside the protein without pretending to be a second whey. Nutricost's
 * PRE-X is the 996 g tub, 17.5 cm, with a shoulder that narrows into a tall
 * black lid. */
export const GORILLA_MODE_TUB = {
  bodyRadius: 0.142,
  bodyHeight: 0.3,
  shoulderHeight: 0,
  neckRadius: 0.142,
  lidRadius: 0.148,
  lidHeight: 0.055,
} as const;
export const PRE_X_TUB = {
  bodyRadius: 0.125,
  bodyHeight: 0.25,
  shoulderHeight: 0.045,
  neckRadius: 0.1,
  lidRadius: 0.115,
  lidHeight: 0.065,
} as const;
/** The 5 lb whey: about 18 cm across and 23 cm tall, so 0.36 by 0.47 here,
 * the tallest of the three and the only one with a wide blue lid. */
export const PROTEIN_TUB = {
  bodyRadius: 0.155,
  bodyHeight: 0.36,
  shoulderHeight: 0.05,
  neckRadius: 0.125,
  lidRadius: 0.135,
  lidHeight: 0.06,
} as const;
type TubShape = typeof GORILLA_MODE_TUB | typeof PRE_X_TUB | typeof PROTEIN_TUB;
export const tubHeight = (shape: TubShape) =>
  shape.bodyHeight + shape.shoulderHeight + shape.lidHeight;
export const GORILLA_MODE_TUB_HEIGHT = tubHeight(GORILLA_MODE_TUB);
export const PRE_X_TUB_HEIGHT = tubHeight(PRE_X_TUB);
export const PROTEIN_TUB_HEIGHT = tubHeight(PROTEIN_TUB);

const labelCache = new Map<string, THREE.CanvasTexture>();

function finishLabel(id: string, canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  labelCache.set(id, texture);
  return texture;
}

/** The back of every tub: a facts block with its lines suggested rather than
 * lettered, so a thrown tub still reads as a tub from behind. */
function drawFactsBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ink: string,
  rule: string,
) {
  ctx.strokeStyle = rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, 190, 222);
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.font = "900 15px Arial, sans-serif";
  ctx.fillText("Supplement Facts", x + 10, y + 22);
  ctx.fillStyle = rule;
  ctx.font = "700 9px Arial, sans-serif";
  ctx.fillText("Serving size 1 scoop", x + 10, y + 38);
  ctx.fillRect(x + 10, y + 44, 170, 3);
  for (let i = 0; i < 11; i++) {
    ctx.fillRect(x + 10, y + 56 + i * 14, 90 + ((i * 37) % 50), 2);
    ctx.fillRect(x + 152, y + 56 + i * 14, 28, 2);
  }
}

/** Original label art in the product's colour language: black tub, orange
 * bands top and bottom, an orange ape, orange GORILLA over silver MODE, the
 * flavour called out in its own colour. Cues, not copied packaging. The
 * front panel is centred on the canvas so it faces the room once the mesh
 * turns half a circle (the same convention SodaCan uses). */
function gorillaModeLabelTexture(): THREE.CanvasTexture {
  const cached = labelCache.get("gorilla-mode");
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, W, H);
  // A faint diagonal hatch so the black is not a dead flat.
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 2;
  for (let i = -H; i < W; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, H);
    ctx.lineTo(i + H, 0);
    ctx.stroke();
  }
  const orange = (y0: number, y1: number) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "#fbbf24");
    g.addColorStop(1, "#ea580c");
    return g;
  };
  ctx.fillStyle = orange(0, 20);
  ctx.fillRect(0, 0, W, 20);
  ctx.fillStyle = orange(H - 18, H);
  ctx.fillRect(0, H - 18, W, 18);
  ctx.fillStyle = "#8c8f94";
  ctx.fillRect(0, H - 22, W, 2);

  const cx = W / 2;
  // The ape, a roaring head built from a few ellipses.
  ctx.save();
  ctx.translate(cx, 84);
  ctx.fillStyle = orange(-50, 50);
  ctx.beginPath();
  ctx.ellipse(0, 0, 52, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-44, 8, 14, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(44, 8, 14, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7c2d12";
  ctx.beginPath();
  ctx.ellipse(0, -20, 40, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c0a04";
  ctx.beginPath();
  ctx.ellipse(-17, -13, 6, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(17, -13, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-8, 1, 4, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(8, 1, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3b0a0a";
  ctx.beginPath();
  ctx.ellipse(0, 27, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b91c1c";
  ctx.beginPath();
  ctx.ellipse(0, 34, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fafafa";
  for (const sx of [-16, 16]) {
    ctx.beginPath();
    ctx.moveTo(sx - 6, 10);
    ctx.lineTo(sx + 6, 10);
    ctx.lineTo(sx, 26);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.font = "italic 900 66px Arial, sans-serif";
  ctx.strokeStyle = "#3a1a05";
  ctx.lineWidth = 6;
  ctx.strokeText("GORILLA", cx, 196);
  ctx.fillStyle = orange(140, 196);
  ctx.fillText("GORILLA", cx, 196);
  ctx.font = "italic 900 52px Arial, sans-serif";
  ctx.strokeStyle = "#2b2b2e";
  ctx.lineWidth = 5;
  ctx.strokeText("MODE", cx, 244);
  const silver = ctx.createLinearGradient(0, 200, 0, 244);
  silver.addColorStop(0, "#f4f4f5");
  silver.addColorStop(1, "#9ca3af");
  ctx.fillStyle = silver;
  ctx.fillText("MODE", cx, 244);
  ctx.fillStyle = orange(250, 268);
  ctx.fillRect(cx - 150, 250, 300, 18);
  ctx.fillStyle = "#111111";
  ctx.font = "900 13px Arial, sans-serif";
  ctx.fillText("PRE-WORKOUT FORMULA", cx, 264);
  // Flavour line with a watermelon wedge, flat side up.
  ctx.fillStyle = "#ff3d7f";
  ctx.font = "italic 900 22px Arial, sans-serif";
  ctx.fillText("WATERMELON", cx + 14, 292);
  ctx.save();
  ctx.translate(cx - 94, 278);
  ctx.fillStyle = "#2e9e44";
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ff3d7f";
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#111111";
  for (const [sx, sy] of [
    [-5, 4],
    [1, 7],
    [5, 3],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(sx, sy, 1.6, 2.4, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "700 11px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("40 SERVINGS", cx - 250, 294);

  drawFactsBlock(ctx, 70, 44, "#f4f4f5", "#a1a1aa");
  // And the wordmark once more, small, on the far side.
  ctx.textAlign = "center";
  ctx.font = "italic 900 28px Arial, sans-serif";
  ctx.fillStyle = orange(150, 176);
  ctx.fillText("GORILLA", 880, 176);
  ctx.font = "italic 900 22px Arial, sans-serif";
  ctx.fillStyle = "#d4d4d8";
  ctx.fillText("MODE", 880, 200);
  return finishLabel("gorilla-mode", canvas);
}

/** PRE-X in Nutricost's colour language, and the same brand blue as the whey
 * beside it: white tub, blue wordmark, a heavy black PRE-X, a blue band at
 * the foot with the flavour, and a navy wedge of raspberries. Cues, not a
 * copy. */
function preXLabelTexture(): THREE.CanvasTexture {
  const cached = labelCache.get("pre-x");
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 300;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const BLUE = "#1262b6";
  const NAVY = "#1c2f6b";
  const INK = "#0f1115";
  ctx.fillStyle = "#f7f7f5";
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;

  // Foot band, with the navy wedge rising out of it on the right.
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 246, W, H - 246);
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.moveTo(cx + 120, H);
  ctx.lineTo(cx + 330, 120);
  ctx.lineTo(cx + 330, H);
  ctx.closePath();
  ctx.fill();
  // Raspberries: clusters of drupelets with a lighter crown.
  const berry = (bx: number, by: number, r: number) => {
    ctx.fillStyle = "#2d5bd6";
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col <= row + 1; col++) {
        const px = bx + (col - (row + 1) / 2) * r * 0.9;
        const py = by - (1 - row) * r * 0.8;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#7aa3ff";
    ctx.beginPath();
    ctx.arc(bx - r * 0.3, by - r * 0.9, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  };
  berry(cx + 262, 228, 14);
  berry(cx + 226, 258, 16);
  berry(cx + 290, 266, 15);

  ctx.textAlign = "center";
  ctx.fillStyle = BLUE;
  ctx.font = "900 34px Arial, sans-serif";
  ctx.fillText("nutricost", cx, 52);
  ctx.font = "600 12px Arial, sans-serif";
  ctx.fillText("P E R F O R M A N C E", cx, 70);
  ctx.fillStyle = INK;
  ctx.save();
  ctx.translate(cx, 158);
  ctx.scale(1.08, 1);
  ctx.font = "900 98px Arial, sans-serif";
  ctx.fillText("PRE-X", 0, 0);
  ctx.restore();
  ctx.fillStyle = BLUE;
  ctx.font = "900 17px Arial, sans-serif";
  ctx.fillText("XTREME PRE-WORKOUT COMPLEX", cx, 184);
  // Three stats with rules between them.
  const stats = [
    ["17G", "PER SERVING", -110],
    ["60", "SERVINGS", 0],
    ["996G", "PER CONTAINER", 110],
  ] as const;
  for (const [big, small, dx] of stats) {
    ctx.fillStyle = INK;
    ctx.font = "900 26px Arial, sans-serif";
    ctx.fillText(big, cx + dx, 218);
    ctx.font = "700 8px Arial, sans-serif";
    ctx.fillText(small, cx + dx, 230);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 56, 200, 2, 32);
  ctx.fillRect(cx + 54, 200, 2, 32);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 19px Arial, sans-serif";
  ctx.fillText("BLUE RASPBERRY", cx - 300, 272);
  ctx.font = "700 8px Arial, sans-serif";
  ctx.fillText("NET WT 35.6 OZ (2.2 LB) (996 G)", cx - 300, 288);

  drawFactsBlock(ctx, 70, 16, INK, "#6b7280");
  ctx.textAlign = "center";
  ctx.fillStyle = BLUE;
  ctx.font = "900 26px Arial, sans-serif";
  ctx.fillText("nutricost", 880, 130);
  ctx.fillStyle = INK;
  ctx.font = "900 40px Arial, sans-serif";
  ctx.fillText("PRE-X", 880, 176);
  return finishLabel("pre-x", canvas);
}

/** Nutricost whey, Chocolate PB: white tub, blue wordmark with its orange
 * underline, heavy black "Whey Protein Isolate", the three stats, an orange
 * foot band with the flavour, and the blue panel with an orange stripe
 * climbing the right side. Same brand blue as the PRE-X beside it. Cues,
 * not a copy. */
function proteinLabelTexture(): THREE.CanvasTexture {
  const cached = labelCache.get("protein");
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 330;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const BLUE = "#1262b6";
  const ORANGE = "#e0801f";
  const INK = "#111214";
  ctx.fillStyle = "#f7f6f2";
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;

  // Blue panel up the right side, orange stripe along its inner edge.
  ctx.fillStyle = BLUE;
  ctx.beginPath();
  ctx.moveTo(cx + 292, 0);
  ctx.lineTo(cx + 330, 0);
  ctx.lineTo(cx + 330, H);
  ctx.lineTo(cx + 190, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  ctx.moveTo(cx + 274, 0);
  ctx.lineTo(cx + 292, 0);
  ctx.lineTo(cx + 190, H);
  ctx.lineTo(cx + 172, H);
  ctx.closePath();
  ctx.fill();
  // Orange foot band.
  ctx.fillStyle = ORANGE;
  ctx.fillRect(cx - 330, 252, 420, H - 252);
  // Peanut butter swoosh with chocolate shards.
  ctx.save();
  ctx.translate(cx + 120, 262);
  ctx.rotate(-0.5);
  ctx.fillStyle = "#c9853a";
  ctx.beginPath();
  ctx.ellipse(0, 0, 58, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a2e12";
  for (const [dx, dy, w, h, r] of [
    [-10, -22, 14, 60, 0.3],
    [12, -18, 12, 54, -0.2],
    [30, -6, 10, 44, 0.6],
  ] as const) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(r);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = BLUE;
  ctx.font = "900 40px Arial, sans-serif";
  ctx.fillText("nutricost", cx - 40, 58);
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx - 40, 20, 70, Math.PI * 0.36, Math.PI * 0.64);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "900 54px Arial, sans-serif";
  ctx.fillText("Whey Protein", cx - 300, 128);
  ctx.fillText("Isolate", cx - 300, 184);
  const stats = [
    ["30G", "Protein Per Serving", 0],
    ["58", "Servings", 130],
    ["5LB", "Per Container", 220],
  ] as const;
  for (const [big, small, dx] of stats) {
    ctx.fillStyle = INK;
    ctx.font = "900 28px Arial, sans-serif";
    ctx.fillText(big, cx - 300 + dx, 224);
    ctx.font = "700 9px Arial, sans-serif";
    ctx.fillText(small, cx - 300 + dx, 238);
  }
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(cx - 185, 200, 2, 40);
  ctx.fillRect(cx - 95, 200, 2, 40);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 20px Arial, sans-serif";
  ctx.fillText("CHOCOLATE PB", cx - 310, 288);
  ctx.font = "700 9px Arial, sans-serif";
  ctx.fillText("NET WT. 5 LB (2,268 G)", cx - 310, 310);
  // Quality roundels on the blue panel.
  for (const [rx, ry] of [
    [cx + 262, 280],
    [cx + 300, 300],
  ] as const) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(rx, ry, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rx, ry, 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawFactsBlock(ctx, 70, 30, INK, "#6b7280");
  ctx.textAlign = "center";
  ctx.fillStyle = BLUE;
  ctx.font = "900 28px Arial, sans-serif";
  ctx.fillText("nutricost", 880, 150);
  ctx.fillStyle = INK;
  ctx.font = "900 24px Arial, sans-serif";
  ctx.fillText("Whey Protein", 880, 186);
  ctx.fillText("Isolate", 880, 214);
  return finishLabel("protein", canvas);
}

function SupplementTub({
  unitIndex,
  palette,
  hoverKey,
  base,
  yaw,
  shape,
  bodyColor,
  lidColor,
  capColor,
  label,
  massKg,
  shadeWidth,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
  hoverKey: string;
  base: [number, number, number];
  yaw: number;
  shape: TubShape;
  bodyColor: string;
  lidColor: string;
  capColor: string;
  label: THREE.CanvasTexture;
  massKg: number;
  shadeWidth: number;
}) {
  const {
    bodyRadius,
    bodyHeight,
    shoulderHeight,
    neckRadius,
    lidRadius,
    lidHeight,
  } = shape;
  const lidBase = bodyHeight + shoulderHeight;
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={hoverKey}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={shadeWidth}
      shape="box"
      massKg={massKg}
    >
      <group rotation={[0, yaw, 0]}>
        <mesh castShadow position={[0, bodyHeight / 2, 0]}>
          <cylinderGeometry
            args={[bodyRadius, bodyRadius * 0.985, bodyHeight, 40]}
          />
          <meshStandardMaterial
            color={bodyColor}
            roughness={0.42}
            metalness={0.04}
          />
        </mesh>
        {/* The label sits a hair proud of the body, parallel to its taper,
            and turns half a circle so the canvas centre faces the room. */}
        <mesh
          castShadow
          position={[0, bodyHeight / 2, 0]}
          rotation={[0, Math.PI, 0]}
        >
          <cylinderGeometry
            args={[
              bodyRadius + 0.0015,
              bodyRadius * 0.985 + 0.0015,
              bodyHeight * 0.88,
              40,
              1,
              true,
            ]}
          />
          <meshStandardMaterial
            map={label}
            roughness={0.5}
            metalness={0.06}
            side={THREE.DoubleSide}
          />
        </mesh>
        {shoulderHeight > 0 && (
          <mesh castShadow position={[0, bodyHeight + shoulderHeight / 2, 0]}>
            <cylinderGeometry
              args={[neckRadius, bodyRadius, shoulderHeight, 40]}
            />
            <meshStandardMaterial
              color={bodyColor}
              roughness={0.42}
              metalness={0.04}
            />
          </mesh>
        )}
        <mesh castShadow position={[0, lidBase + lidHeight / 2, 0]}>
          <cylinderGeometry args={[lidRadius, lidRadius, lidHeight, 40]} />
          <meshStandardMaterial
            color={lidColor}
            roughness={0.38}
            metalness={0.04}
          />
        </mesh>
        {/* The recessed cap inside the lid's rim. */}
        <mesh position={[0, lidBase + lidHeight + 0.002, 0]}>
          <cylinderGeometry
            args={[lidRadius * 0.88, lidRadius * 0.88, 0.004, 40]}
          />
          <meshStandardMaterial color={capColor} roughness={0.5} />
        </mesh>
      </group>
    </Grabbable>
  );
}

type TubProps = {
  unitIndex: number;
  palette: UnitProps["palette"];
  dark: boolean;
  base: [number, number, number];
  /** Turn the front panel a little off square, like the protein beside it. */
  yaw?: number;
};

export function GorillaModeTub({
  unitIndex,
  palette,
  dark,
  base,
  yaw = 0.34,
}: TubProps) {
  const label = useMemo(() => gorillaModeLabelTexture(), []);
  // A hair lighter in the dark theme so the tub keeps an edge against the
  // shadowed bay instead of reading as a hole in the shelf.
  const plastic = dark ? "#1b1b1e" : "#131316";
  return (
    <SupplementTub
      unitIndex={unitIndex}
      palette={palette}
      hoverKey="grab:gorilla-mode"
      base={base}
      yaw={yaw}
      shape={GORILLA_MODE_TUB}
      bodyColor={plastic}
      lidColor={plastic}
      capColor={dark ? "#2a2a2e" : "#232327"}
      label={label}
      massKg={1}
      shadeWidth={0.37}
    />
  );
}

export function PreXTub({
  unitIndex,
  palette,
  dark,
  base,
  yaw = -0.22,
}: TubProps) {
  const label = useMemo(() => preXLabelTexture(), []);
  const lid = dark ? "#1b1b1e" : "#131316";
  return (
    <SupplementTub
      unitIndex={unitIndex}
      palette={palette}
      hoverKey="grab:pre-x"
      base={base}
      yaw={yaw}
      shape={PRE_X_TUB}
      bodyColor="#f3f2ee"
      lidColor={lid}
      capColor={dark ? "#2a2a2e" : "#232327"}
      label={label}
      massKg={1.15}
      shadeWidth={0.34}
    />
  );
}

export function ProteinTub({
  unitIndex,
  palette,
  dark,
  base,
  yaw = 0.3,
}: TubProps) {
  const label = useMemo(() => proteinLabelTexture(), []);
  return (
    <SupplementTub
      unitIndex={unitIndex}
      palette={palette}
      hoverKey="grab:protein"
      base={base}
      yaw={yaw}
      shape={PROTEIN_TUB}
      bodyColor="#f3f2ee"
      lidColor={dark ? "#2a6cc4" : "#1262b6"}
      capColor={dark ? "#1f5aa8" : "#0f4f96"}
      label={label}
      massKg={2.5}
      shadeWidth={0.42}
    />
  );
}
