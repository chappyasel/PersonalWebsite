"use client";

// Lit, tone-mapped replacement for drei's unlit <Image>. A standard
// material carries the texture, so covers/frames/portrait grade through
// ACES with everything else, warm near the lamp, and sit in the fog story
// instead of printing sRGB 255 like stickers. object-fit: cover is emulated
// with repeat/offset; books get a real rounded-rect ShapeGeometry (opaque
// queue — no transparent sorting), frames and portrait a plain plane.
//
// One exception to "with everything else": the print grade's chroma rebuild
// (Effects.tsx) skips photographs, which are display-referred already and
// which it overshoots. Every image here is a photograph unless the caller
// says `gradeChroma`, which the two cover-art sites do; see photoMaskLayer.ts.
import { useTexture } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  type LitImageDetail,
  clearReleasedLitImageDetail,
  liveLitImageDetailResource,
} from "./litImageDetail";
import { registerPhotograph } from "./photoMaskLayer";
import { type ScenePhotoRole, scenePhotoUrl } from "./photoTextures";
import { useScenePerformanceSettings } from "./scenePerformance";
import { scenePhotoDetailTextures } from "./scenePhotoDetails";

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

type LitImageProps = {
  url: string;
  /** Optional master when `url` is already a right-sized remote preview. */
  detailUrl?: string;
  /** Runtime resolution class for local v8 scene photography. */
  role?: ScenePhotoRole;
  width: number;
  height: number;
  radius?: number;
  roughness?: number;
  /** Warm-grade strength (0 disables). */
  grade?: number;
  /** Let the print grade rebuild chroma on this image as it does on the
   * room. Off for photographs (the default), which keep the file's own
   * chroma through the mask the grade reads; cover art turns it on. */
  gradeChroma?: boolean;
  /** Crop zoom (1 = cover fit) + focal point [x from left, y from top]. */
  zoom?: number;
  focus?: [number, number];
  position?: [number, number, number];
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
};

type LitImageSourceProps = Omit<LitImageProps, "url" | "detailUrl" | "role"> & {
  previewTexture: THREE.Texture;
  detailTexture: THREE.Texture | null;
};

function LitImageSource({
  previewTexture,
  detailTexture,
  width,
  height,
  radius = 0,
  roughness = 0.6,
  grade = 0.08,
  gradeChroma = false,
  zoom = 1,
  focus,
  position,
  onPointerOver,
  onPointerOut,
  onClick,
}: LitImageSourceProps) {
  // Photographs register for the mask the grade reads; cover art never does.
  const mesh = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current || gradeChroma) return;
    return registerPhotograph(mesh.current);
  }, [gradeChroma]);
  // drei caches useTexture by URL. Every print needs an instance-local
  // transform because repeat/offset encode this mesh's aspect and focal
  // point; mutating the cached texture made a second use of the same cover
  // retroactively recrop the first. Texture.clone shares the decoded image
  // bytes while isolating sampler state, so reuse remains cheap and safe.
  const sourceTexture = detailTexture ?? previewTexture;
  const texture = useMemo(() => sourceTexture.clone(), [sourceTexture]);
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const fx = focus?.[0] ?? 0.5;
  const fy = focus?.[1] ?? 0.5;
  useMemo(() => {
    if (grade > 0) warmGrade(texture, grade);
    texture.anisotropy = maxAnisotropy;
    fitCover(texture, width, height, zoom, [fx, fy]);
    texture.needsUpdate = true;
  }, [texture, maxAnisotropy, width, height, grade, zoom, fx, fy]);
  useEffect(() => () => texture.dispose(), [texture]);
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
      ref={mesh}
      geometry={geometry}
      position={position}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <meshStandardMaterial map={texture} roughness={roughness} />
    </mesh>
  );
}

export default function LitImage({
  url,
  detailUrl,
  role = "feature",
  ...props
}: LitImageProps) {
  const performanceSettings = useScenePerformanceSettings();
  const previewUrl = scenePhotoUrl(url, role);
  const previewTexture = useTexture(previewUrl);
  const detailsDisabled = !performanceSettings.highResolutionPhotos;
  const [detail, setDetail] = useState<LitImageDetail<THREE.Texture> | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    let leasedDetail: LitImageDetail<THREE.Texture> | null = null;
    if (!detailUrl || detailsDisabled || detailUrl === previewUrl)
      return () => undefined;
    const lease = scenePhotoDetailTextures.request(detailUrl);
    void lease.promise
      .then((texture) => {
        leasedDetail = {
          url: detailUrl,
          resource: texture,
          isReleased: () => lease.released,
        };
        if (active) setDetail(leasedDetail);
      })
      .catch(() => {
        // The preview remains the durable fallback. A later mount retries a
        // failed master because failed promises are removed from the cache.
      });
    return () => {
      active = false;
      const released = leasedDetail;
      lease.release();
      if (released)
        setDetail((current) => clearReleasedLitImageDetail(current, released));
    };
  }, [detailUrl, detailsDisabled, previewUrl]);

  const detailTexture = liveLitImageDetailResource({
    detail,
    enabled: !detailsDisabled,
    url: detailUrl,
  });

  // Only callers with a distinct authored detail URL request another decode.
  // Local scene photos remain on their role-sized assets.
  return (
    <LitImageSource
      previewTexture={previewTexture}
      detailTexture={detailTexture}
      {...props}
    />
  );
}
