"use client";

import { type Palette, rand } from "../theme";
import { RoundedBox } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import React, { useMemo } from "react";
import * as THREE from "three";

import { FootPool } from "./GroundPool";

export type SecretReadingRoomRefs = {
  groupRef: React.RefObject<THREE.Group | null>;
  interiorRef: React.RefObject<THREE.Group | null>;
  thresholdRef: React.RefObject<THREE.Group | null>;
  keyLightRef: React.RefObject<THREE.PointLight | null>;
  fillLightRef: React.RefObject<THREE.PointLight | null>;
  dustRef: React.RefObject<THREE.Points | null>;
};

type BookPose = {
  x: number;
  width: number;
  height: number;
  depth: number;
  lean: number;
  color: string;
  band: string;
  pages: string;
};

function libraryRow(
  count: number,
  span: number,
  salt: number,
  palette: Palette,
): BookPose[] {
  const widths = Array.from(
    { length: count },
    (_, index) => 0.045 + rand(index, salt) * 0.035,
  );
  const natural = widths.reduce((sum, width) => sum + width, 0);
  const gap = Math.max(0.012, (span - natural) / Math.max(1, count - 1));
  let cursor = -span / 2;
  return widths.map((width, index) => {
    const height = 0.19 + rand(index, salt + 1) * 0.105;
    const pose: BookPose = {
      x: cursor + width / 2,
      width,
      height,
      depth: 0.105 + rand(index, salt + 2) * 0.045,
      lean:
        index > 0 && index < count - 1 && rand(index, salt + 3) > 0.78
          ? (rand(index, salt + 4) > 0.5 ? 1 : -1) *
            (0.055 + rand(index, salt + 5) * 0.08)
          : 0,
      color: palette.spines[(index + salt) % palette.spines.length]!,
      band: index % 3 === 0 ? "#cda968" : "#d9c7a4",
      pages: palette.pages,
    };
    cursor += width + gap;
    return pose;
  });
}

/** A tiny actual book: rounded cover, inset page block, headcap, and spine
 * tooling. The previous hidden room used one box per book; at reveal scale it
 * read as toy bricks. These silhouettes hold up when the camera arrives. */
function LibraryBook({ pose }: { pose: BookPose }) {
  const { x, width, height, depth, lean, color, band } = pose;
  return (
    <group position={[x, 0, 0]} rotation={[0, 0, lean]}>
      <RoundedBox
        args={[width, height, depth]}
        radius={Math.min(0.009, width * 0.14)}
        smoothness={3}
        position={[0, height / 2, 0]}
      >
        <meshStandardMaterial color={color} roughness={0.68} />
      </RoundedBox>
      <mesh position={[0, height * 0.67, depth / 2 + 0.0015]}>
        <planeGeometry args={[width * 0.58, 0.012]} />
        <meshStandardMaterial color={band} metalness={0.35} roughness={0.46} />
      </mesh>
      <mesh position={[0, height * 0.35, depth / 2 + 0.0015]}>
        <planeGeometry args={[width * 0.48, 0.006]} />
        <meshStandardMaterial color="#c9b48d" roughness={0.56} />
      </mesh>
      <mesh position={[0, height + 0.002, 0]}>
        <boxGeometry args={[width * 0.78, 0.006, depth * 0.82]} />
        <meshStandardMaterial color={pose.pages} roughness={0.88} />
      </mesh>
    </group>
  );
}

function LibraryBookRow({
  x,
  y,
  z,
  span,
  count,
  salt,
  palette,
}: {
  x: number;
  y: number;
  z: number;
  span: number;
  count: number;
  salt: number;
  palette: Palette;
}) {
  const books = useMemo(
    () => libraryRow(count, span, salt, palette),
    [count, palette, salt, span],
  );
  return (
    <group position={[x, y, z]}>
      {books.map((pose, index) => (
        <LibraryBook key={index} pose={pose} />
      ))}
    </group>
  );
}

function BuiltInLibrary({
  x,
  palette,
  salt,
}: {
  x: number;
  palette: Palette;
  salt: number;
}) {
  const dark = palette.skyTop === "#1e2842";
  const wood = dark ? "#332920" : "#493326";
  const inset = dark ? "#171a1d" : "#211b18";
  const shelfY = [-0.7, -0.25, 0.2, 0.65];
  return (
    <group position={[x, 0, -1.06]}>
      <RoundedBox
        args={[0.88, 1.98, 0.1]}
        radius={0.025}
        smoothness={4}
        position={[0, -0.04, -0.08]}
      >
        <meshStandardMaterial color={inset} roughness={0.92} />
      </RoundedBox>
      {[-0.47, 0.47].map((side) => (
        <RoundedBox
          key={side}
          args={[0.085, 2.08, 0.24]}
          radius={0.018}
          smoothness={3}
          position={[side, -0.01, 0.02]}
        >
          <meshStandardMaterial color={wood} roughness={0.66} />
        </RoundedBox>
      ))}
      <RoundedBox
        args={[1.02, 0.11, 0.25]}
        radius={0.018}
        smoothness={3}
        position={[0, 1.01, 0.02]}
      >
        <meshStandardMaterial color={wood} roughness={0.66} />
      </RoundedBox>
      {shelfY.map((y, row) => (
        <group key={y}>
          <RoundedBox
            args={[0.92, 0.055, 0.25]}
            radius={0.009}
            smoothness={3}
            position={[0, y, 0.025]}
          >
            <meshStandardMaterial color={wood} roughness={0.72} />
          </RoundedBox>
          <LibraryBookRow
            x={0}
            y={y + 0.03}
            z={0.105}
            span={0.72}
            count={8}
            salt={salt + row * 17}
            palette={palette}
          />
        </group>
      ))}
      <mesh position={[0, -0.04, 0.076]}>
        <planeGeometry args={[0.78, 1.88]} />
        <meshStandardMaterial
          color={dark ? "#24211e" : "#2c231d"}
          roughness={0.96}
        />
      </mesh>
    </group>
  );
}

function ReadingDesk({ palette }: { palette: Palette }) {
  const dark = palette.skyTop === "#1e2842";
  const leather = dark ? "#442d27" : "#69443a";
  return (
    <group>
      {/* Walnut writing table and tapered legs. */}
      <RoundedBox
        args={[1.06, 0.085, 0.42]}
        radius={0.025}
        smoothness={4}
        position={[0.06, -0.44, -0.58]}
      >
        <meshStandardMaterial color={palette.wood} roughness={0.58} />
      </RoundedBox>
      {[-0.4, 0.48].map((x) => (
        <group key={x}>
          <mesh
            position={[x, -0.745, -0.7]}
            rotation={[0, 0, x < 0 ? -0.035 : 0.035]}
          >
            <cylinderGeometry args={[0.025, 0.036, 0.65, 12]} />
            <meshStandardMaterial color={palette.woodDark} roughness={0.64} />
          </mesh>
          <mesh
            position={[x, -0.745, -0.47]}
            rotation={[0, 0, x < 0 ? -0.035 : 0.035]}
          >
            <cylinderGeometry args={[0.025, 0.036, 0.65, 12]} />
            <meshStandardMaterial color={palette.woodDark} roughness={0.64} />
          </mesh>
        </group>
      ))}

      {/* Open notebook: separately curled pages and ink rules catch the lamp. */}
      <group
        position={[-0.14, -0.389, -0.49]}
        rotation={[-Math.PI / 2, 0, -0.08]}
      >
        <RoundedBox
          args={[0.29, 0.2, 0.012]}
          radius={0.012}
          smoothness={4}
          position={[-0.145, 0, 0]}
        >
          <meshStandardMaterial color={palette.paper} roughness={0.9} />
        </RoundedBox>
        <RoundedBox
          args={[0.29, 0.2, 0.012]}
          radius={0.012}
          smoothness={4}
          position={[0.145, 0, 0]}
        >
          <meshStandardMaterial color={palette.pages} roughness={0.9} />
        </RoundedBox>
        {[-0.055, -0.018, 0.019, 0.056].map((y) => (
          <React.Fragment key={y}>
            <mesh position={[-0.145, y, 0.007]}>
              <planeGeometry args={[0.21, 0.005]} />
              <meshBasicMaterial color={palette.ink} />
            </mesh>
            <mesh position={[0.145, y, 0.007]}>
              <planeGeometry args={[0.21, 0.005]} />
              <meshBasicMaterial color={palette.ink} />
            </mesh>
          </React.Fragment>
        ))}
        <mesh position={[0, 0, 0.011]}>
          <boxGeometry args={[0.012, 0.205, 0.012]} />
          <meshStandardMaterial color="#b89d67" roughness={0.46} />
        </mesh>
      </group>

      {/* Articulated brass task lamp. */}
      <mesh position={[0.4, -0.382, -0.66]}>
        <cylinderGeometry args={[0.095, 0.11, 0.025, 24]} />
        <meshStandardMaterial
          color="#9c7138"
          metalness={0.76}
          roughness={0.26}
        />
      </mesh>
      <mesh position={[0.4, -0.2, -0.66]} rotation={[0, 0, 0.08]}>
        <cylinderGeometry args={[0.012, 0.016, 0.35, 10]} />
        <meshStandardMaterial
          color="#b98a47"
          metalness={0.82}
          roughness={0.24}
        />
      </mesh>
      <mesh position={[0.32, -0.02, -0.63]} rotation={[0.08, 0, -0.48]}>
        <cylinderGeometry args={[0.012, 0.012, 0.28, 10]} />
        <meshStandardMaterial
          color="#b98a47"
          metalness={0.82}
          roughness={0.24}
        />
      </mesh>
      <mesh position={[0.24, 0.08, -0.61]} rotation={[Math.PI, 0, -0.12]}>
        <coneGeometry args={[0.12, 0.17, 28, 1, true]} />
        <meshStandardMaterial
          color="#b98a47"
          metalness={0.72}
          roughness={0.3}
          side={THREE.DoubleSide}
          emissive="#ffc56f"
          emissiveIntensity={0.22}
        />
      </mesh>

      {/* Club chair — layered wood, leather shell, cushion, arms, feet. */}
      <group position={[0.62, -1.065, -0.02]} rotation={[0, -0.16, 0]}>
        <RoundedBox
          args={[0.48, 0.16, 0.42]}
          radius={0.075}
          smoothness={5}
          position={[0, 0.24, 0]}
        >
          <meshStandardMaterial color={leather} roughness={0.72} />
        </RoundedBox>
        <RoundedBox
          args={[0.45, 0.53, 0.14]}
          radius={0.07}
          smoothness={5}
          position={[0, 0.52, -0.16]}
          rotation={[-0.1, 0, 0]}
        >
          <meshStandardMaterial color={leather} roughness={0.7} />
        </RoundedBox>
        <RoundedBox
          args={[0.39, 0.1, 0.34]}
          radius={0.045}
          smoothness={5}
          position={[0, 0.34, 0.02]}
        >
          <meshStandardMaterial color="#8b5d48" roughness={0.86} />
        </RoundedBox>
        {[-0.26, 0.26].map((x) => (
          <RoundedBox
            key={x}
            args={[0.09, 0.18, 0.41]}
            radius={0.04}
            smoothness={4}
            position={[x, 0.35, 0]}
          >
            <meshStandardMaterial color={leather} roughness={0.74} />
          </RoundedBox>
        ))}
        {[-0.18, 0.18].map((x) => (
          <mesh key={x} position={[x, 0.135, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.27, 10]} />
            <meshStandardMaterial color={palette.woodDark} roughness={0.62} />
          </mesh>
        ))}
      </group>
      <FootPool
        color={palette.shadow}
        size={[1.18, 0.58]}
        position={[0.06, -1.075, -0.58]}
        opacity={0.16}
      />
      <FootPool
        color={palette.shadow}
        size={[0.72, 0.55]}
        position={[0.62, -1.074, -0.02]}
        opacity={0.22}
      />
    </group>
  );
}

function WallArt({ palette }: { palette: Palette }) {
  return (
    <group position={[0.05, 0.57, -1.205]}>
      <RoundedBox args={[0.66, 0.55, 0.045]} radius={0.018} smoothness={4}>
        <meshStandardMaterial color="#7b5838" roughness={0.58} />
      </RoundedBox>
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={[0.57, 0.46]} />
        <meshStandardMaterial color={palette.paper} roughness={0.94} />
      </mesh>
      <mesh position={[0.11, 0.06, 0.028]}>
        <circleGeometry args={[0.105, 32]} />
        <meshStandardMaterial color="#b87845" roughness={0.84} />
      </mesh>
      <mesh position={[-0.1, -0.07, 0.029]} rotation={[0, 0, -0.18]}>
        <planeGeometry args={[0.23, 0.035]} />
        <meshStandardMaterial color="#40584f" roughness={0.9} />
      </mesh>
      <mesh position={[-0.15, -0.015, 0.03]} rotation={[0, 0, 0.45]}>
        <planeGeometry args={[0.16, 0.025]} />
        <meshStandardMaterial color="#40584f" roughness={0.9} />
      </mesh>
    </group>
  );
}

export default function SecretReadingRoom({
  palette,
  groupRef,
  interiorRef,
  thresholdRef,
  keyLightRef,
  fillLightRef,
  dustRef,
  returnControl,
}: {
  palette: Palette;
  returnControl: React.ReactNode;
} & SecretReadingRoomRefs) {
  const dark = palette.skyTop === "#1e2842";
  const viewportWidth = useThree((state) => state.size.width);
  // Portrait framing crops the outer 0.5 world-unit on each side. Bring the
  // medallion onto the inner panel there; desktop has enough width to keep it
  // on the clear jamb opposite the hinged case.
  const returnX = viewportWidth < 1200 ? 0.82 : 1.42;
  const dust = useMemo(() => {
    const positions = new Float32Array(48 * 3);
    for (let index = 0; index < 48; index += 1) {
      positions[index * 3] = (rand(index, 214) - 0.5) * 2.65;
      positions[index * 3 + 1] = -0.9 + rand(index, 215) * 1.9;
      positions[index * 3 + 2] = 0.12 - rand(index, 216) * 1.35;
    }
    return positions;
  }, []);

  return (
    <group
      ref={groupRef}
      name="stacks-secret-reading-room"
      position={[0, -0.04, -0.48]}
    >
      {/* The room stays physically behind the moving case. Its actual
          surfaces begin deeper in the bay at opacity zero, then approach and
          fade on the authored room channel—there is no cover geometry. */}
      <group ref={interiorRef} position={[0, 0, -0.65]}>
        <RoundedBox
          args={[3.24, 2.34, 0.1]}
          radius={0.045}
          smoothness={5}
          position={[0, -0.04, -1.31]}
        >
          <meshStandardMaterial
            color={dark ? "#15171a" : "#1e1917"}
            roughness={0.96}
          />
        </RoundedBox>

        {/* Narrow wall panelling creates a room-sized backdrop between the
            book bays instead of leaving the scene as shelves in a void. */}
        {[-0.52, 0.05, 0.62].map((x, index) => (
          <group key={x} position={[x, 0.02, -1.252]}>
            <RoundedBox
              args={[0.47, 1.96, 0.035]}
              radius={0.014}
              smoothness={3}
            >
              <meshStandardMaterial
                color={dark ? "#27221e" : "#33261f"}
                roughness={0.82}
              />
            </RoundedBox>
            <mesh position={[0, 0, 0.021]}>
              <planeGeometry args={[0.39, 1.84]} />
              <meshStandardMaterial
                color={index === 1 ? "#25211f" : "#2b2521"}
                roughness={0.94}
              />
            </mesh>
          </group>
        ))}

        <BuiltInLibrary x={-1.08} palette={palette} salt={230} />
        <BuiltInLibrary x={1.08} palette={palette} salt={310} />
        <WallArt palette={palette} />
        <ReadingDesk palette={palette} />

        {/* Floorboards, rug and threshold make the volume continue toward the
            viewer; depth is what turns the replacement scene into a place. */}
        {Array.from({ length: 9 }, (_, index) => (
          <mesh key={index} position={[0, -1.075, -0.04 - index * 0.18]}>
            <boxGeometry args={[3.18, 0.035, 0.165]} />
            <meshStandardMaterial
              color={
                dark
                  ? index % 2
                    ? "#3b2a23"
                    : "#493127"
                  : index % 2
                    ? "#74503b"
                    : "#815a42"
              }
              roughness={0.84}
            />
          </mesh>
        ))}
        <mesh
          position={[0.1, -1.052, -0.48]}
          rotation={[-Math.PI / 2, 0, 0.03]}
        >
          <circleGeometry args={[0.71, 48]} />
          <meshStandardMaterial
            color={dark ? "#54342f" : "#7b493e"}
            roughness={0.94}
          />
        </mesh>
        <mesh
          position={[0.1, -1.049, -0.48]}
          rotation={[-Math.PI / 2, 0, 0.03]}
        >
          <ringGeometry args={[0.49, 0.65, 48]} />
          <meshStandardMaterial color="#b3915d" roughness={0.86} />
        </mesh>
      </group>

      {/* The warm threshold arrives before the room, then the arched frame
          reads as the boundary the original shelf was concealing. */}
      <group ref={thresholdRef} position={[0, 0, -0.35]}>
        {[-1.52, 1.52].map((x) => (
          <RoundedBox
            key={x}
            args={[0.115, 2.22, 0.19]}
            radius={0.022}
            smoothness={4}
            position={[x, -0.02, 0]}
          >
            <meshStandardMaterial color={palette.woodDark} roughness={0.62} />
          </RoundedBox>
        ))}
        <RoundedBox
          args={[3.15, 0.115, 0.19]}
          radius={0.022}
          smoothness={4}
          position={[0, 1.04, 0]}
        >
          <meshStandardMaterial color={palette.woodDark} roughness={0.62} />
        </RoundedBox>
        <mesh position={[0, -1.05, 0.13]}>
          <boxGeometry args={[3.06, 0.045, 0.24]} />
          <meshStandardMaterial
            color="#9b713a"
            metalness={0.76}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[returnX + 0.035, -0.68, 0.101]}>
          <circleGeometry args={[0.23, 32]} />
          <meshStandardMaterial color="#34271d" roughness={0.78} />
        </mesh>
        {/* The return medallion lives on the clear jamb, opposite the open
            case. On the old left jamb the door itself hid the only exit. */}
        <group position={[returnX, -0.53, 0.02]}>{returnControl}</group>
      </group>

      <pointLight
        ref={keyLightRef}
        color="#ffc978"
        intensity={0}
        distance={4.6}
        decay={2}
        position={[0.25, 0.12, 0.52]}
      />
      <pointLight
        ref={fillLightRef}
        color="#eaa15d"
        intensity={0}
        distance={3.5}
        decay={2}
        position={[-0.72, 0.58, -0.52]}
      />

      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={palette.dust}
          size={0.015}
          transparent
          opacity={0}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
}
