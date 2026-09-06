"use client";

// The Weightlifting App on the phone's glass.
//
// The phone lies face down on the Projects shelf, so the screen is nothing
// from the room; a carry turns it to the camera (HeldFacing in UnitProjects)
// and this is what it shows. The picture is fetched the first time anyone
// shows interest in the phone, not with the unit: a hundred kilobytes nobody who
// never touches the phone should pay for.
import { useStacks } from "../../store";
import { useThree } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  PHONE_SCREEN_ASPECT,
  PHONE_SCREEN_TEXTURE_WIDTH,
  paintPhoneScreen,
  phoneScreenLayout,
} from "./phoneScreenLayout";

const PHONE_SCREEN_IMAGE = "/images/stacks/v8/projects-phone-screen.webp";

/** The glass face of the model is x ±0.35, y 0.024…1.484 on its −z side at
 * z −0.084 (decoded from the GLB). The panel sits a touch inside the glass,
 * and at the 393:852 proportion that makes it 1.431 tall, centred on the
 * face; 1.5 mm proud of the glass so it never fights it. */
const PHONE_DISPLAY_WIDTH = 0.66;
const PHONE_DISPLAY_CENTRE_Y = 0.754;
const PHONE_DISPLAY_Z = -0.0855;

export default function PhoneScreen({ hoverKey }: { hoverKey: string }) {
  const gl = useThree((state) => state.gl);
  const screen = useMemo(() => {
    const layout = phoneScreenLayout(PHONE_SCREEN_TEXTURE_WIDTH);
    const canvas = document.createElement("canvas");
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext("2d")!;
    paintPhoneScreen(ctx, null, layout);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // The held phone is seen at a slant more often than square on, and text
    // is the first thing a plain mip chain smears there.
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return { ctx, layout, texture };
  }, [gl]);
  const requested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (requested.current) return;
      requested.current = true;
      new THREE.ImageLoader().load(PHONE_SCREEN_IMAGE, (image) => {
        if (cancelled) return;
        paintPhoneScreen(screen.ctx, image, screen.layout);
        screen.texture.needsUpdate = true;
      });
    };
    const interested = (state: {
      hovered: string | null;
      dragging: string | null;
      focusedInteraction: string | null;
    }) =>
      state.hovered === hoverKey ||
      state.dragging === hoverKey ||
      state.focusedInteraction === hoverKey;
    if (interested(useStacks.getState())) load();
    const unsubscribe = useStacks.subscribe((state) => {
      if (interested(state)) load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hoverKey, screen]);

  React.useEffect(() => () => screen.texture.dispose(), [screen]);

  return (
    // Faces −z, the way the glass does; a half turn about y keeps the picture
    // reading left to right for whoever the phone is turned toward. The quad
    // is paper-thin and must not become part of the phone's hull.
    <mesh
      position={[0, PHONE_DISPLAY_CENTRE_Y, PHONE_DISPLAY_Z]}
      rotation={[0, Math.PI, 0]}
      userData={{ physicsIgnore: true }}
    >
      <planeGeometry
        args={[PHONE_DISPLAY_WIDTH, PHONE_DISPLAY_WIDTH * PHONE_SCREEN_ASPECT]}
      />
      <meshStandardMaterial
        map={screen.texture}
        emissive="#ffffff"
        emissiveMap={screen.texture}
        emissiveIntensity={0.55}
        roughness={0.35}
        transparent
        alphaTest={0.5}
      />
    </mesh>
  );
}
