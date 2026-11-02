"use client";

import Grabbable from "../Grabbable";
import React, { useMemo } from "react";
import * as THREE from "three";

import type { UnitProps } from "./types";
import { TRAINING_BATHROOM_SCALE } from "./unitShelfLayout";

const GLASS = "#f4f4f1";
const BEVEL = 0.008;

/** A rounded square in the XZ plane, centred on the origin. */
function roundedSquare(width: number, radius: number) {
  const h = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h + radius, -h);
  shape.lineTo(h - radius, -h);
  shape.quadraticCurveTo(h, -h, h, -h + radius);
  shape.lineTo(h, h - radius);
  shape.quadraticCurveTo(h, h, h - radius, h);
  shape.lineTo(-h + radius, h);
  shape.quadraticCurveTo(-h, h, -h, h - radius);
  shape.lineTo(-h, -h + radius);
  shape.quadraticCurveTo(-h, -h, -h + radius, -h);
  return shape;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Seven-segment letters for the display, segments a to g clockwise from the
 * top with g in the middle. */
const SEGMENTS: Record<string, string> = {
  H: "bcefg",
  E: "adefg",
  L: "def",
  O: "abcdef",
};

function drawSegmentLetter(
  ctx: CanvasRenderingContext2D,
  letter: string,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
) {
  const on = SEGMENTS[letter] ?? "";
  const mid = y + h / 2;
  const bars: Record<string, [number, number, number, number]> = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, h / 2 - 1.5 * t],
    c: [x + w - t, mid + t / 2, t, h / 2 - 1.5 * t],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, mid + t / 2, t, h / 2 - 1.5 * t],
    f: [x, y + t, t, h / 2 - 1.5 * t],
    g: [x + t, mid - t / 2, w - 2 * t, t],
  };
  for (const segment of on) {
    const [bx, by, bw, bh] = bars[segment]!;
    ctx.fillRect(bx, by, bw, bh);
  }
}

const topCache = new Map<string, THREE.CanvasTexture>();

/** The glass top in the Scale X's own layout: a plain band across the far
 * edge holding the display, four faintly grey electrode panels split by clear
 * lines, the silver pad in the centre, and the wordmark in the near band. */
function scaleTopTexture(): THREE.CanvasTexture {
  const cached = topCache.get("wyze");
  if (cached) return cached;
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const radius =
    (TRAINING_BATHROOM_SCALE.cornerRadius / TRAINING_BATHROOM_SCALE.width) *
    size;

  ctx.save();
  roundedRectPath(ctx, 0, 0, size, size, radius);
  ctx.clip();
  ctx.fillStyle = GLASS;
  ctx.fillRect(0, 0, size, size);

  const inset = size * 0.04;
  const panelTop = size * 0.25;
  const panelBottom = size * 0.86;
  const split = size * 0.6;
  const gap = size * 0.014;
  ctx.fillStyle = "#e2e2de";
  ctx.fillRect(
    inset,
    panelTop,
    size / 2 - inset - gap / 2,
    split - panelTop - gap / 2,
  );
  ctx.fillRect(
    size / 2 + gap / 2,
    panelTop,
    size / 2 - inset - gap / 2,
    split - panelTop - gap / 2,
  );
  ctx.fillRect(
    inset,
    split + gap / 2,
    size / 2 - inset - gap / 2,
    panelBottom - split - gap / 2,
  );
  ctx.fillRect(
    size / 2 + gap / 2,
    split + gap / 2,
    size / 2 - inset - gap / 2,
    panelBottom - split - gap / 2,
  );

  // A soft diagonal sheen across the glass.
  const sheen = ctx.createLinearGradient(size * 0.3, 0, size * 0.75, size);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0.55)");
  sheen.addColorStop(0.6, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  // HELLO in grey segments, centred in the far band.
  ctx.fillStyle = "#a6a6a2";
  const letterW = size * 0.072;
  const letterH = size * 0.105;
  const pitch = size * 0.1;
  const word = "HELLO";
  const startX = size / 2 - (pitch * (word.length - 1) + letterW) / 2;
  for (let i = 0; i < word.length; i++)
    drawSegmentLetter(
      ctx,
      word[i]!,
      startX + i * pitch,
      size * 0.085,
      letterW,
      letterH,
      size * 0.011,
    );

  // The centre pad: a brushed silver pill standing across the split.
  const padW = size * 0.045;
  const padH = size * 0.2;
  const pad = ctx.createLinearGradient(
    size / 2 - padW / 2,
    0,
    size / 2 + padW / 2,
    0,
  );
  pad.addColorStop(0, "#c4c4c2");
  pad.addColorStop(0.5, "#ececea");
  pad.addColorStop(1, "#bdbdbb");
  ctx.fillStyle = pad;
  roundedRectPath(
    ctx,
    size / 2 - padW / 2,
    split - padH / 2,
    padW,
    padH,
    padW / 2,
  );
  ctx.fill();
  ctx.strokeStyle = "#a9a9a6";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#c2c2bf";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `300 ${Math.round(size * 0.045)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText("W Y Z E", size / 2, size * 0.93);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  topCache.set("wyze", texture);
  return texture;
}

/** The bathroom scale on the floor in front of the barbell. It opens the
 * weight log. */
export function BathroomScale({
  unitIndex,
  palette,
}: {
  unitIndex: number;
  palette: UnitProps["palette"];
}) {
  const { width, height, cornerRadius, yaw } = TRAINING_BATHROOM_SCALE;
  const body = useMemo(() => {
    const geometry = new THREE.ExtrudeGeometry(
      roundedSquare(width - 2 * BEVEL, cornerRadius - BEVEL),
      {
        depth: height - 2 * BEVEL,
        bevelEnabled: true,
        bevelThickness: BEVEL,
        bevelSize: BEVEL,
        bevelSegments: 3,
        curveSegments: 10,
      },
    );
    // Extrude runs along +z; stand it up so the slab rises from y = 0.
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, BEVEL, 0);
    return geometry;
  }, [width, height, cornerRadius]);
  const top = useMemo(() => scaleTopTexture(), []);

  return (
    <Grabbable
      unitIndex={unitIndex}
      to="weight-log"
      hoverKey="grab:bathroom-scale"
      base={[...TRAINING_BATHROOM_SCALE.base]}
      shadeColor={palette.shadow}
      shadeWidth={0.66}
      shape="box"
      massKg={2}
      standsOn="floor"
    >
      <group rotation={[0, yaw, 0]}>
        <mesh castShadow receiveShadow geometry={body}>
          <meshStandardMaterial
            color={GLASS}
            roughness={0.22}
            metalness={0.02}
          />
        </mesh>
        <mesh
          receiveShadow
          position={[0, height + 0.0008, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[width, width]} />
          <meshStandardMaterial
            map={top}
            alphaTest={0.5}
            roughness={0.18}
            metalness={0.02}
          />
        </mesh>
      </group>
    </Grabbable>
  );
}
