"use client";

// Lit, tone-mapped replacement for drei's unlit <Image>. A standard
// material carries the texture, so covers/frames/portrait grade through
// ACES with everything else, warm near the lamp, and sit in the fog story
// instead of printing sRGB 255 like stickers. object-fit: cover is emulated
// with repeat/offset; books get a real rounded-rect ShapeGeometry (opaque
// queue — no transparent sorting), frames and portrait a plain plane.
import { useTexture } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** object-fit: cover with an optional zoom and focal point. `focus` is
 * CSS-object-position-like: [x from left, y from TOP], each 0..1. */
function fitCover(
  tex: THREE.Texture,
  w: number,
  h: number,
  zoom = 1,
  focus: [number, number] = [0.5, 0.5],
) {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (!img?.width || !img.height) return;
  const texAspect = img.width / img.height;
  const target = w / h;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  let rx = 1;
  let ry = 1;
  if (texAspect > target) rx = target / texAspect;
  else ry = texAspect / target;
  rx /= zoom;
  ry /= zoom;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  tex.repeat.set(rx, ry);
  tex.offset.set(
    clamp(focus[0] - rx / 2, 1 - rx),
    clamp(1 - focus[1] - ry / 2, 1 - ry),
  );
}

/** ShapeGeometry writes raw plane coords into uv — normalize to [0,1]. */
function roundedRectGeometry(w: number, h: number, r: number) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ShapeGeometry(shape, 8);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h + 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Multiply the decoded image toward the room's lamp warmth on a canvas —
 * photographic content otherwise injects teal/magenta and reads as a backlit
 * monitor in a warm room (audit §2.4). Runs once per texture (useTexture
 * caches by URL); strength ~0.08 keeps identity.  */
function warmGrade(tex: THREE.Texture, grade: number) {
  const img = tex.image as HTMLImageElement | undefined;
  if (!img?.width || tex.userData.graded) return;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = grade;
  ctx.fillStyle = "#ffce96";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  tex.image = canvas;
  tex.userData.graded = true;
  tex.needsUpdate = true;
}

export default function LitImage({
  url,
  width,
  height,
  radius = 0,
  roughness = 0.6,
  grade = 0.08,
  zoom = 1,
  focus,
  position,
  onPointerOver,
  onPointerOut,
  onClick,
}: {
  url: string;
  width: number;
  height: number;
  radius?: number;
  roughness?: number;
  /** Warm-grade strength (0 disables). */
  grade?: number;
  /** Crop zoom (1 = cover fit) + focal point [x from left, y from top]. */
  zoom?: number;
  focus?: [number, number];
  position?: [number, number, number];
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const tex = useTexture(url);
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  // useTexture caches by URL — the instance is shared, so mutating
  // repeat/offset is safe only while each URL renders on exactly one mesh
  // (true today; clone here if a URL is ever reused).
  const fx = focus?.[0] ?? 0.5;
  const fy = focus?.[1] ?? 0.5;
  useMemo(() => {
    if (grade > 0) warmGrade(tex, grade);
    tex.anisotropy = maxAnisotropy;
    fitCover(tex, width, height, zoom, [fx, fy]);
    tex.needsUpdate = true;
  }, [tex, maxAnisotropy, width, height, grade, zoom, fx, fy]);
  const geometry = useMemo(
    () =>
      radius > 0
        ? roundedRectGeometry(width, height, radius)
        : new THREE.PlaneGeometry(width, height),
    [width, height, radius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={position}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <meshStandardMaterial map={tex} roughness={roughness} />
    </mesh>
  );
}
