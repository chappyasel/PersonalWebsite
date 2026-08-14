"use client";

// Three butterflies over the flower field, day only.
//
// The meadow has weather, wind and drifting light but nothing in it that
// chooses where to go. These do: each one flies a deterministic path built
// from sines at incommensurate frequencies, so the trio never falls into step
// and never repeats inside a session, with no state to integrate and nothing
// to reseed on a tab return.
//
// They ride the CAMERA in x — position is `camera.position.x + offset`, the
// offset wandering inside ±6 — because the traverse runs the camera 27 world
// units across a field that is only ever ~11 wide on screen. A butterfly
// parked in world x is a butterfly you see for four seconds of a one-minute
// scroll. Riding the camera is also why the wander frequencies stay low: the
// visible motion is the offset, and the traverse supplies the rest.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { MEADOW_GROUND_BASE } from "./meadowField";

const TAU = Math.PI * 2;

/** ~11 cm total wingspan at the meadow's scale, which is a large real
 * swallowtail. The outline below keeps that footprint while replacing the
 * old rectangles with distinct forewing and hindwing lobes. */
const WING_SPAN = 0.05;

function createWingGeometry() {
  const wing = new THREE.Shape();
  // Shape-space +y becomes world -z after the mesh is laid flat. The upper
  // run is therefore the swept-back forewing; the lower lobe is the smaller,
  // rounder hindwing. Both meet at the thorax rather than at a square edge.
  wing.moveTo(0.002, -0.014);
  wing.bezierCurveTo(0.018, -0.03, 0.043, -0.033, WING_SPAN, -0.021);
  wing.bezierCurveTo(0.057, -0.006, 0.047, 0.009, 0.034, 0.012);
  wing.bezierCurveTo(0.044, 0.024, 0.038, 0.038, 0.023, 0.035);
  wing.bezierCurveTo(0.011, 0.031, 0.004, 0.017, 0.002, 0.008);
  wing.closePath();
  const geometry = new THREE.ShapeGeometry(wing, 5);

  // A low-cost root-to-tip value gradient suggests wing membranes and a dark
  // thoracic joint without another mesh, texture, or draw call. Vertex colour
  // multiplies each butterfly's authored species colour.
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const across = THREE.MathUtils.clamp(position.getX(i) / WING_SPAN, 0, 1);
    const shade = 0.62 + 0.38 * Math.sqrt(across);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createBodyGeometry() {
  const body = new THREE.Shape();
  body.moveTo(-0.006, -0.012);
  body.bezierCurveTo(-0.007, 0.002, -0.0045, 0.028, 0, 0.037);
  body.bezierCurveTo(0.0045, 0.028, 0.007, 0.002, 0.006, -0.012);
  body.closePath();

  const head = new THREE.Shape();
  head.absarc(0, -0.019, 0.0065, 0, TAU, false);

  // Antennae are narrow tapered membranes rather than Lines: native WebGL
  // line width is inconsistent, while these remain visible as a one-pixel
  // silhouette on every device and can merge into the same body draw.
  const antenna = (side: 1 | -1) => {
    const shape = new THREE.Shape();
    shape.moveTo(side * 0.0015, -0.022);
    shape.lineTo(side * 0.014, -0.045);
    shape.lineTo(side * 0.0124, -0.046);
    shape.lineTo(side * 0.0005, -0.024);
    shape.closePath();
    return shape;
  };
  return new THREE.ShapeGeometry([body, head, antenna(-1), antenna(1)], 5);
}

const FLAP_AMP = 1.0;
/** Body heading eases toward the travel direction rather than snapping to it:
 * where the two wander sines briefly cancel, the instantaneous heading is
 * undefined and would flick. */
const YAW_LAMBDA = 4.0;
const ROLL_LAMBDA = 5.0;
const BANK_K = 0.55;
const BANK_MAX = 0.45;
/** Theme crossfade, matching the meadow's own uDark damp. */
const DARK_LAMBDA = 3.5;

// Wing colours are the meadow's three flower species (Meadow.tsx COLORS:
// #5b76d6 cornflower, #e0862f poppy, #ece0c6 cream) lifted toward the light,
// because these are unlit MeshBasicMaterial against a field whose flowers are
// shaded — authored at the flower hexes they printed as three dark flecks.
//
// Every number below is per-butterfly on purpose: shared frequencies are what
// make three insects read as one flock of clones. Amplitudes are chosen so
// |x offset| stays under 6, z stays inside [−5, 3] (in front of the shelf
// line, short of the camera), and y stays between the grass tips and a hand's
// width above the flower heads.
//
// Each axis row is one slow sweep plus one quick one: amplitude, frequency in
// Hz, phase. `lane` is the world z the flight is centred on; `cruise` is its
// height ABOVE the ground plane, so the whole trio rides with the meadow if
// the terrain is ever re-based.
const FLIGHTS = [
  {
    color: "#f2e8d2",
    flapHz: 9.3,
    lane: -1.15,
    cruise: 0.4,
    x: { a1: 3.2, f1: 0.0361, p1: 0.0, a2: 1.5, f2: 0.127, p2: 1.93 },
    z: { a1: 2.55, f1: 0.0442, p1: 2.41, a2: 0.95, f2: 0.1487, p2: 0.62 },
    y: { a1: 0.09, f1: 0.0713, p1: 1.07, a2: 0.025, f2: 0.1907, p2: 3.4 },
  },
  {
    color: "#8b9be0",
    flapHz: 8.2,
    lane: -0.55,
    cruise: 0.46,
    x: { a1: 2.7, f1: 0.0293, p1: 2.6, a2: 1.9, f2: 0.1093, p2: 0.41 },
    z: { a1: 2.05, f1: 0.0526, p1: 0.87, a2: 1.2, f2: 0.1721, p2: 3.05 },
    y: { a1: 0.1, f1: 0.0617, p1: 2.88, a2: 0.03, f2: 0.2113, p2: 0.95 },
  },
  {
    color: "#e8a25e",
    flapHz: 10.1,
    lane: -1.6,
    cruise: 0.49,
    x: { a1: 3.5, f1: 0.0417, p1: 4.12, a2: 1.3, f2: 0.1613, p2: 2.27 },
    z: { a1: 2.4, f1: 0.0384, p1: 5.02, a2: 0.9, f2: 0.1319, p2: 1.44 },
    y: { a1: 0.09, f1: 0.0821, p1: 4.35, a2: 0.025, f2: 0.1663, p2: 5.6 },
  },
] as const;

/** Scratch for `sines2` — the frame loop is sequential and single-threaded, so
 * one module-scope record beats returning a fresh object per axis per frame. */
const WAVE = { v: 0, d: 0, dd: 0 };

/** Sum of two sines with its first two derivatives, evaluated from ABSOLUTE
 * time. Nothing here accumulates per-frame deltas: a phase built by summing
 * `delta` runs at double speed on a 120 Hz display. The derivatives are what
 * give the heading and the bank for free — no finite differencing, so neither
 * one can chatter at low frame rates. */
function sines2(
  t: number,
  a1: number,
  f1: number,
  p1: number,
  a2: number,
  f2: number,
  p2: number,
) {
  const w1 = TAU * f1;
  const w2 = TAU * f2;
  const s1 = Math.sin(w1 * t + p1);
  const s2 = Math.sin(w2 * t + p2);
  WAVE.v = a1 * s1 + a2 * s2;
  WAVE.d = a1 * w1 * Math.cos(w1 * t + p1) + a2 * w2 * Math.cos(w2 * t + p2);
  WAVE.dd = -(a1 * w1 * w1 * s1 + a2 * w2 * w2 * s2);
}

const wrapPi = (a: number) =>
  THREE.MathUtils.euclideanModulo(a + Math.PI, TAU) - Math.PI;

function Flight({ dark }: { dark: boolean }) {
  const root = useRef<THREE.Group>(null);
  const bodies = useRef<(THREE.Group | null)[]>([]);
  /** Wing pivots, two per butterfly at 2i (span +x) and 2i+1 (span −x). */
  const wings = useRef<(THREE.Group | null)[]>([]);
  // Start AT the current theme: a dark boot must not open with three
  // butterflies shrinking away.
  const darkAmt = useRef(dark ? 1 : 0);
  const wingGeometry = useMemo(() => createWingGeometry(), []);
  const bodyGeometry = useMemo(() => createBodyGeometry(), []);
  useEffect(
    () => () => {
      wingGeometry.dispose();
      bodyGeometry.dispose();
    },
    [bodyGeometry, wingGeometry],
  );

  useFrame(({ clock, camera }, delta) => {
    const g = root.current;
    if (!g) return;
    darkAmt.current = THREE.MathUtils.damp(
      darkAmt.current,
      dark ? 1 : 0,
      DARK_LAMBDA,
      delta,
    );
    const day = 1 - darkAmt.current;
    // Night costs one damp and one comparison — nothing below runs, and the
    // meshes are off the draw list rather than drawn at zero scale.
    g.visible = day > 0.02;
    if (!g.visible) return;

    const t = clock.elapsedTime;
    const ease = 1 - Math.exp(-YAW_LAMBDA * delta);
    for (let i = 0; i < FLIGHTS.length; i++) {
      const b = bodies.current[i];
      const wr = wings.current[i * 2];
      const wl = wings.current[i * 2 + 1];
      if (!b || !wr || !wl) continue;
      const f = FLIGHTS[i]!;

      sines2(t, f.x.a1, f.x.f1, f.x.p1, f.x.a2, f.x.f2, f.x.p2);
      const ox = WAVE.v;
      const vx = WAVE.d;
      const ax = WAVE.dd;
      sines2(t, f.z.a1, f.z.f1, f.z.p1, f.z.a2, f.z.f2, f.z.p2);
      const oz = WAVE.v;
      const vz = WAVE.d;
      const az = WAVE.dd;
      sines2(t, f.y.a1, f.y.f1, f.y.p1, f.y.a2, f.y.f2, f.y.p2);
      const oy = WAVE.v;
      const vy = WAVE.d;

      // Wings quiet down on the way down and beat hardest on the way up. Held
      // as an AMPLITUDE fade rather than a rate change: retiming `t * flapHz`
      // mid-flight jumps the phase and the wings tear.
      const glide = THREE.MathUtils.smoothstep(vy, -0.055, 0.02);
      const phase = t * TAU * f.flapHz;
      const flap = FLAP_AMP * (0.32 + 0.68 * glide) * Math.sin(phase);
      wr.rotation.z = flap;
      wl.rotation.z = -flap;

      // A fifth of a wing-span of bob, in quadrature with the beat, which is
      // most of what sells a flap that is otherwise two rectangles hinging.
      b.position.set(
        camera.position.x + ox,
        MEADOW_GROUND_BASE + f.cruise + oy + 0.01 * Math.cos(phase),
        f.lane + oz,
      );

      // Heading from the wander velocity alone, deliberately not including
      // the camera's own x speed: during a fast traverse that term dwarfs the
      // flight and would swing all three butterflies broadside at once.
      const speed2 = Math.max(vx * vx + vz * vz, 0.04);
      b.rotation.y += wrapPi(Math.atan2(vx, vz) - b.rotation.y) * ease;
      // Bank into the turn. Forward is +z and up is +y, so +x is the LEFT
      // side and a left turn (yaw rising) needs a negative roll. Euler XYZ
      // applies roll before yaw, i.e. about the body's own forward axis.
      const turn = (vz * ax - vx * az) / speed2;
      b.rotation.z = THREE.MathUtils.damp(
        b.rotation.z,
        THREE.MathUtils.clamp(-BANK_K * turn, -BANK_MAX, BANK_MAX),
        ROLL_LAMBDA,
        delta,
      );

      // Scaled per body, never on the root: the root sits at the world
      // origin, so shrinking it there would fly all three home before they
      // vanished instead of fading out where they are.
      b.scale.setScalar(day);
    }
  });

  return (
    <group ref={root}>
      {FLIGHTS.map((f, i) => (
        <group
          key={f.color}
          ref={(o) => {
            bodies.current[i] = o;
          }}
        >
          {/* A readable insect silhouette at this scale: tapered abdomen,
              distinct head, and splayed antennae, merged into one shared
              mesh. It sits just above the wings and follows their yaw/bank. */}
          <mesh
            geometry={bodyGeometry}
            position={[0, 0.004, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <meshBasicMaterial color="#30251e" side={THREE.DoubleSide} />
          </mesh>
          {[1, -1].map((side) => (
            <group
              key={side}
              ref={(o) => {
                wings.current[i * 2 + (side === 1 ? 0 : 1)] = o;
              }}
            >
              {/* Mirrored from one shared anatomical outline, hinged at the
                  thorax and laid flat so z rotation is a dihedral flap. */}
              <mesh
                geometry={wingGeometry}
                rotation={[-Math.PI / 2, 0, 0]}
                scale={[side, 1, 1]}
                raycast={() => null}
              >
                <meshBasicMaterial
                  color={f.color}
                  side={THREE.DoubleSide}
                  vertexColors
                />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Reduced motion gets no butterflies at all. There is no still version of
 * this worth keeping — three motionless rectangles hanging over the flowers
 * are worse than an empty field. The gate is read once at mount and lives in
 * a wrapper so the flight's own hooks stay unconditional. */
export default function Butterflies({ dark }: { dark: boolean }) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  if (reduced) return null;
  return <Flight dark={dark} />;
}
