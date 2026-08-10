"use client";

// New scene props for the About, Blog, and Systems units.
// Box props use RoundedBox for edge highlights (see primitives.tsx).
import { RoundedBox } from "@react-three/drei";
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";

import { type Palette, rand } from "../theme";
import { useStacks } from "../store";
import Lift from "./Lift";
import LitImage from "./LitImage";

/** Framed standing portrait — the identity anchor of the About unit.
 * Zoom/focus re-crops toward the face; the source square otherwise leads
 * with a blurry foreground hand (audit §3-About). */
export function PortraitFrame({
  src,
  palette,
  textured,
}: {
  src: string;
  palette: Palette;
  textured: boolean;
}) {
  return (
    <group position={[0, 0.62, -0.08]} rotation={[-0.06, 0.06, 0]}>
      <RoundedBox
        castShadow
        args={[1.02, 1.24, 0.04]}
        radius={0.012}
        smoothness={4}
        position={[0, 0, -0.024]}
      >
        <meshStandardMaterial color={palette.frame} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[0.94, 1.16]} />
        <meshStandardMaterial color={palette.pages} roughness={0.9} />
      </mesh>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            width={0.86}
            height={1.08}
            roughness={0.5}
            zoom={1.35}
            focus={[0.52, 0.3]}
          />
        </React.Suspense>
      )}
    </group>
  );
}

/** Instant-print photo: white border, square image high in the frame. Used
 * leaning on shelves and pinned to the corkboard. */
export function Polaroid({
  src,
  palette,
  size = 0.24,
  textured = true,
}: {
  src: string;
  palette: Palette;
  size?: number;
  textured?: boolean;
}) {
  const h = size * 1.21;
  return (
    <group>
      <RoundedBox castShadow args={[size, h, 0.008]} radius={0.003} smoothness={2}>
        <meshStandardMaterial color={palette.paper} roughness={0.85} />
      </RoundedBox>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            width={size * 0.88}
            height={size * 0.88}
            roughness={0.55}
            position={[0, h * 0.062, 0.0045]}
          />
        </React.Suspense>
      )}
    </group>
  );
}

/** Small leaning print — the Budapest postcard by the globe. */
export function PostcardPrint({
  src,
  palette,
  textured = true,
}: {
  src: string;
  palette: Palette;
  textured?: boolean;
}) {
  return (
    <group>
      <RoundedBox castShadow args={[0.21, 0.15, 0.005]} radius={0.002} smoothness={2}>
        <meshStandardMaterial color={palette.paper} roughness={0.9} />
      </RoundedBox>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            width={0.195}
            height={0.135}
            roughness={0.6}
            position={[0, 0, 0.003]}
          />
        </React.Suspense>
      )}
    </group>
  );
}

/** Small stack of calling cards — white-edged, printed top card (v3's
 * pages-toned boxes read as offcut lumber, audit §3-About). */
export function CardStack({ palette }: { palette: Palette }) {
  const printTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 154;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f8f2e4";
    ctx.fillRect(0, 0, 256, 154);
    ctx.fillStyle = "#4a3f30";
    ctx.font = "600 26px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("CHAPPY ASEL", 128, 72);
    ctx.fillRect(78, 88, 100, 2);
    ctx.font = "18px Georgia, serif";
    ctx.fillStyle = "#75634e";
    ctx.fillText("chappyasel.com", 128, 116);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }, []);
  return (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <RoundedBox
          key={i}
          castShadow
          args={[0.3, 0.01, 0.18]}
          radius={0.004}
          smoothness={4}
          position={[i * 0.006, 0.005 + i * 0.011, i * 0.004]}
          rotation={[0, rand(i, 41) * 0.5 - 0.25, 0]}
        >
          <meshStandardMaterial color={palette.paper} roughness={0.85} />
        </RoundedBox>
      ))}
      <mesh
        position={[0.018, 0.0441, 0.012]}
        rotation={[-Math.PI / 2, 0, -(rand(3, 41) * 0.5 - 0.25)]}
      >
        <planeGeometry args={[0.284, 0.166]} />
        <meshStandardMaterial map={printTexture} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Paper inbox tray with fanned sheets — replaces the blank quote-card
 * trifold, the audit's worst single element (§3-Systems). */
export function InboxTray({ palette }: { palette: Palette }) {
  return (
    <group rotation={[0, -0.18, 0]}>
      <RoundedBox castShadow args={[0.38, 0.016, 0.28]} radius={0.004} smoothness={4} position={[0, 0.008, 0]}>
        <meshStandardMaterial color={palette.strap} roughness={0.6} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <RoundedBox
          key={side}
          castShadow
          args={[0.014, 0.075, 0.28]}
          radius={0.004}
          smoothness={4}
          position={[side * 0.183, 0.045, 0]}
        >
          <meshStandardMaterial color={palette.strap} roughness={0.6} />
        </RoundedBox>
      ))}
      <RoundedBox castShadow args={[0.38, 0.075, 0.014]} radius={0.004} smoothness={4} position={[0, 0.045, -0.133]}>
        <meshStandardMaterial color={palette.strap} roughness={0.6} />
      </RoundedBox>
      {/* fanned sheets inside, one riding up the back wall */}
      {[0, 1, 2, 3].map((i) => (
        <RoundedBox
          key={i}
          args={[0.3, 0.0045, 0.21]}
          radius={0.002}
          smoothness={2}
          position={[rand(i, 83) * 0.02 - 0.01, 0.02 + i * 0.006, rand(i, 84) * 0.02 - 0.01]}
          rotation={[0, rand(i, 85) * 0.16 - 0.08, 0]}
        >
          <meshStandardMaterial
            color={i % 2 === 0 ? palette.paper : palette.pages}
            roughness={0.95}
          />
        </RoundedBox>
      ))}
      <RoundedBox
        args={[0.28, 0.004, 0.2]}
        radius={0.002}
        smoothness={2}
        position={[0, 0.085, -0.085]}
        rotation={[-0.62, 0, 0.03]}
      >
        <meshStandardMaterial color={palette.paper} roughness={0.95} />
      </RoundedBox>
    </group>
  );
}

/** Row of leaning notebook spines; the front few are clickable blog posts. */
export function NotebookLean({
  palette,
  count = 6,
  clickKeys = [],
  onNotebookClick,
}: {
  palette: Palette;
  count?: number;
  clickKeys?: string[];
  onNotebookClick?: (key: string) => void;
}) {
  const setHovered = useStacks((s) => s.setHovered);
  // Two cool accents among warm neutrals, like the shelf spines.
  const colors = [
    palette.spines[8],
    palette.spines[2],
    palette.spines[7],
    palette.spines[9],
    palette.spines[3],
    palette.spines[5],
  ];
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const key = clickKeys[i];
        const lean = i === count - 1 ? -0.2 : rand(i, 51) * 0.06 - 0.03;
        const x = i * 0.105 - (count * 0.105) / 2 + (i === count - 1 ? 0.015 : 0);
        const spine = (
          <RoundedBox
            castShadow
            args={[0.062, 0.52, 0.34]}
            radius={0.008}
            smoothness={4}
            rotation={[0, 0, lean]}
            onPointerOver={
              key
                ? (e) => {
                    e.stopPropagation();
                    setHovered(`notebook:${key}`);
                  }
                : undefined
            }
            onPointerOut={
              key
                ? () => {
                    if (useStacks.getState().hovered === `notebook:${key}`)
                      setHovered(null);
                  }
                : undefined
            }
            onClick={
              key && onNotebookClick
                ? (e) => {
                    if ((e.delta ?? 0) > 6) return; // swipe, not a tap
                    e.stopPropagation();
                    onNotebookClick(key);
                  }
                : undefined
            }
          >
            <meshStandardMaterial
              color={colors[i % colors.length]}
              roughness={0.6 + rand(i, 52) * 0.3}
            />
          </RoundedBox>
        );
        // Only clickable spines pay for a useFrame slot. 0.257 = lean-
        // compensated contact, sunk ~radius/2 to bury the bevel rim.
        return key ? (
          <Lift
            key={i}
            hoverKey={`notebook:${key}`}
            base={[x, 0.257, 0]}
            offset={[0, 0.04, 0.02]}
          >
            {spine}
          </Lift>
        ) : (
          <group key={i} position={[x, 0.257, 0]}>
            {spine}
          </group>
        );
      })}
    </group>
  );
}

/** Paper stack + pen for the Blog lower shelf. */
export function PaperStack({ palette }: { palette: Palette }) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <RoundedBox
          key={i}
          castShadow
          args={[0.42, 0.016, 0.3]}
          radius={0.004}
          smoothness={4}
          position={[i * 0.008, 0.008 + i * 0.017, i * -0.006]}
          rotation={[0, rand(i, 61) * 0.3 - 0.15, 0]}
        >
          <meshStandardMaterial color={palette.paper} roughness={0.95} />
        </RoundedBox>
      ))}
      <mesh
        castShadow
        position={[0.12, 0.062, 0.1]}
        rotation={[0, 0.9, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.012, 0.012, 0.3, 12]} />
        <meshStandardMaterial
          color={palette.hub}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}

/** Canvas clock face overlaid on the GLB dials (the painted dial sits
 * behind it on the atlas). Shows the VISITOR'S live local time — owner
 * call at browse ("show the correct time instead of 3:45"); the 3:45
 * wake-up story moved into the click easter egg. Redraws on the minute. */
export function ClockFace({ radius = 0.082 }: { radius?: number }) {
  const { texture, draw } = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const c = size / 2;
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    const draw = (hours: number, minutes: number) => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#f6efdf";
      ctx.beginPath();
      ctx.arc(c, c, c, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6e5d49";
      ctx.lineWidth = 6;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = i % 3 === 0 ? 0.78 : 0.86;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * c * r0, c + Math.sin(a) * c * r0);
        ctx.lineTo(c + Math.cos(a) * c * 0.92, c + Math.sin(a) * c * 0.92);
        ctx.stroke();
      }
      ctx.strokeStyle = "#443a2d";
      ctx.lineCap = "round";
      const hour =
        (((hours % 12) + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(hour) * c * 0.45, c + Math.sin(hour) * c * 0.45);
      ctx.stroke();
      const minute = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(
        c + Math.cos(minute) * c * 0.68,
        c + Math.sin(minute) * c * 0.68,
      );
      ctx.stroke();
      ctx.fillStyle = "#443a2d";
      ctx.beginPath();
      ctx.arc(c, c, 10, 0, Math.PI * 2);
      ctx.fill();
      texture.needsUpdate = true;
    };
    return { texture, draw };
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      draw(now.getHours(), now.getMinutes());
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [draw]);

  return (
    <mesh>
      <circleGeometry args={[radius, 32]} />
      <meshStandardMaterial map={texture} roughness={0.8} />
    </mesh>
  );
}

