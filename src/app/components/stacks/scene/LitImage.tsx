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

function fitCover(tex: THREE.Texture, w: number, h: number) {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (!img?.width || !img.height) return;
  const texAspect = img.width / img.height;
  const target = w / h;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  if (texAspect > target) {
    tex.repeat.set(target / texAspect, 1);
    tex.offset.set((1 - target / texAspect) / 2, 0);
  } else {
    tex.repeat.set(1, texAspect / target);
    tex.offset.set(0, (1 - texAspect / target) / 2);
  }
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

export default function LitImage({
  url,
  width,
  height,
  radius = 0,
  roughness = 0.6,
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
  useMemo(() => {
    tex.anisotropy = maxAnisotropy;
    fitCover(tex, width, height);
    tex.needsUpdate = true;
  }, [tex, maxAnisotropy, width, height]);
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
