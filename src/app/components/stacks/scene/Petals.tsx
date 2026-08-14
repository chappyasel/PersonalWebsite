"use client";

// Loose flower petals on the wind, day only.
//
// The butterflies fly; these do not. A petal is off the plant and has no say
// in where it goes: it takes the meadow's wind vector, tumbles on the way
// down, and lands. That is the whole behaviour, and it is the point — the
// field already has wind you can see in the grass, and this is the same wind
// carrying something you can follow across the frame.
//
// Ten instances, but never ten in the air. Each petal is alive for 40% of its
// loop and dormant (scale 0) for the rest, and the ten are wired as five
// ANTIPHASE PAIRS: partners share a period and sit exactly half a loop apart,
// so a pair is physically incapable of having both petals up at once and has
// one up 80% of the time. Concurrency is therefore Binomial(5, 0.8) — capped
// at five, three-to-five 94% of the time, effectively never zero. Ten
// independent timers give the same MEAN but a tail that empties the sky for
// seconds and then dumps nine petals at once, which reads as confetti.
//
// They ride the CAMERA in x, for the reason Butterflies.tsx does: the traverse
// runs the camera 27 world units across a field only ~11 wide on screen, so a
// petal parked in world x is on screen for a blink of a one-minute scroll.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { MEADOW_GROUND_BASE } from "./meadowField";

const TAU = Math.PI * 2;

/** A petal, not a leaf: 2 × 3 cm at the meadow's scale. */
const PETAL_W = 0.02;
const PETAL_H = 0.03;

/** One low-poly, gently cupped petal shared by all ten instances. A flat
 * rectangle reads as confetti the moment it turns broadside; this outline
 * narrows into the flower attachment at one end, rounds at the other, and
 * carries a raised centre fold that changes its silhouette while tumbling. */
function createPetalGeometry() {
  const halfW = PETAL_W * 0.5;
  const halfH = PETAL_H * 0.5;
  const rows = [
    { y: -halfH, width: 0, fold: 0 },
    { y: -halfH * 0.72, width: halfW * 0.4, fold: 0.0006 },
    { y: -halfH * 0.3, width: halfW * 0.8, fold: 0.0018 },
    { y: halfH * 0.2, width: halfW, fold: 0.0028 },
    { y: halfH * 0.67, width: halfW * 0.74, fold: 0.0018 },
    { y: halfH * 0.93, width: halfW * 0.3, fold: 0.0007 },
    { y: halfH, width: 0, fold: 0 },
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < rows.length; row++) {
    const r = rows[row]!;
    // The right edge is a touch tighter and the ridge wanders slightly: real
    // loose petals are not bilaterally perfect, even when they share a plant.
    positions.push(-r.width, r.y, 0);
    positions.push(
      Math.sin((row / (rows.length - 1)) * Math.PI) * 0.00045,
      r.y,
      r.fold,
    );
    positions.push(r.width * 0.88, r.y, 0);
    const endFade = Math.sin((row / (rows.length - 1)) * Math.PI);
    colors.push(0.7, 0.7, 0.7);
    colors.push(
      0.82 + 0.18 * endFade,
      0.82 + 0.18 * endFade,
      0.82 + 0.18 * endFade,
    );
    colors.push(0.74, 0.74, 0.74);
    if (row === rows.length - 1) continue;
    const here = row * 3;
    const next = here + 3;
    indices.push(
      here,
      next,
      here + 1,
      here + 1,
      next,
      next + 1,
      here + 1,
      next + 1,
      here + 2,
      here + 2,
      next + 1,
      next + 2,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// The base wind angle out of the grass shader (Meadow.tsx WIND_GLSL: the noise
// swings ±0.6 rad around −2.35). Held as the angle rather than a hardcoded
// vector so a retuned wind carries the petals with it. (cos, sin) of an angle
// is already unit length, so DRIFT is exactly u/s downwind, and PERP is that
// turned a quarter turn — the axis a falling petal sideslips along.
const WIND_ANGLE = -2.35;
const DRIFT_SPEED = 0.15;
const DRIFT_X = DRIFT_SPEED * Math.cos(WIND_ANGLE);
const DRIFT_Z = DRIFT_SPEED * Math.sin(WIND_ANGLE);
const PERP_X = -Math.sin(WIND_ANGLE);
const PERP_Z = Math.cos(WIND_ANGLE);

/** Loop lengths, one per antiphase pair. Deliberately not multiples of each
 * other: pairs that re-align on a common beat would pulse. */
const PERIODS = [41.0, 43.5, 46.0, 48.5, 51.0];
/** Where each pair's FIRST petal starts in its loop; the second starts at
 * +0.5, which is what makes the pair antiphase. */
const PHASES = [0.0, 0.17, 0.34, 0.51, 0.68];
/** Fraction of a loop spent in the air. Must stay under 0.5 or a pair's two
 * petals overlap and the concurrency cap above stops holding. At 0.4 the
 * lives land at 16.4–20.4 s. */
const DUTY = 0.4;

/** Height above the ground plane where the petal reaches the lawn and goes.
 * Not the ground itself — it disappears into the grass tips, which is where a
 * real petal stops being a petal you can see. */
const LAND_Y = 0.12;
const FLUTTER_Y = 0.012;
const SWAY = 0.055;
/** Theme crossfade, matching the meadow's own uDark damp. */
const DARK_LAMBDA = 3.5;

// Colours are the meadow's three flower species (Meadow.tsx COLORS: #5b76d6
// cornflower, #e0862f poppy, #ece0c6 cream) lifted toward the light, reusing
// the butterflies' lifted values — same problem, same fix: these are unlit
// MeshBasicMaterial against a shaded field, and at the authored hexes they
// print as dark specks rather than petals.
const CORNFLOWER = "#8b9be0";
const POPPY = "#e8a25e";
const CREAM = "#f2e8d2";

// One row per petal:
//
//   c   species colour, 5/2/3 — the field's own 55/20/25 split, as close as
//       ten instances get. Arranged so no PAIR (i and i+5) shares a colour,
//       or every handoff would read as one petal blinking to a new spot.
//   x   spawn offset from the camera. All in the +x half: the drift is
//       downwind (−x, −z) and eats ~2 units over a life, so spawning at the
//       far edge would carry them past ±6, off the field's visible width.
//   z   spawn lane, in front of the shelf line and short of the camera.
//   y   spawn height ABOVE the ground plane, so the flight rides with the
//       meadow if the terrain is ever re-based. Descent is derived rather
//       than authored — each petal falls y → LAND_Y over exactly its own
//       life, which puts the rate at 0.006–0.015 u/s and guarantees the
//       fade-out happens AT the grass instead of above or below it.
//   sa  tumble rates in rad/s, incommensurate within a row so the plane
//   sb  never settles into a flat spin and keeps catching the light edge-on.
//   fh  flutter frequency. The wobble in y and the sideslip along the
//       perpendicular axis are this one wave in quadrature, which is what
//       makes a tumbling petal appear to skid sideways as it falls.
const PETALS = [
  { c: CORNFLOWER, x: 4.2, z: 1.6, y: 0.3, sa: 1.13, sb: 0.71, fh: 0.47 },
  { c: CREAM, x: 1.1, z: -0.4, y: 0.26, sa: 0.87, sb: 1.29, fh: 0.36 },
  { c: CORNFLOWER, x: 3.4, z: 2.6, y: 0.33, sa: 1.41, sb: 0.63, fh: 0.55 },
  { c: POPPY, x: -0.6, z: 0.9, y: 0.28, sa: 0.69, sb: 1.07, fh: 0.41 },
  { c: CORNFLOWER, x: 2.3, z: -1.2, y: 0.31, sa: 1.23, sb: 0.83, fh: 0.62 },
  { c: CREAM, x: 4.8, z: 0.2, y: 0.25, sa: 0.94, sb: 1.51, fh: 0.33 },
  { c: CORNFLOWER, x: 0.4, z: 2.1, y: 0.34, sa: 1.31, sb: 0.77, fh: 0.51 },
  { c: CREAM, x: 2.9, z: -0.9, y: 0.29, sa: 0.61, sb: 1.19, fh: 0.44 },
  { c: CORNFLOWER, x: 1.7, z: 1.2, y: 0.24, sa: 1.07, sb: 0.91, fh: 0.58 },
  { c: POPPY, x: 3.9, z: -1.4, y: 0.32, sa: 1.47, sb: 0.67, fh: 0.38 },
] as const;

const PAIRS = PERIODS.length;

/** The three phase columns — flutter, and one per tumble axis — walked rather
 * than authored: an irrational stride around the circle lands ten phases about
 * as far apart as ten phases get, and three unrelated strides keep the two
 * tumbles and the flutter from arriving in step at t = 0, which is the one
 * moment their differing rates cannot separate them. Index-based, so a petal
 * looks the same on every load. */
const phases = (stride: number) =>
  PETALS.map((_, i) => (i * TAU * stride) % TAU);
const FLUT_PH = phases(0.381966);
const SPIN_A_PH = phases(0.754878);
const SPIN_B_PH = phases(0.56984);

/** Transform scratch. The frame loop is sequential and single-threaded, so one
 * module-scope carrier beats a fresh Object3D per instance per frame. */
const DUMMY = new THREE.Object3D();

function Drift({ dark }: { dark: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const petalGeometry = useMemo(() => createPetalGeometry(), []);
  // Start AT the current theme, so a dark boot does not open by shrinking ten
  // petals away.
  const darkAmt = useRef(dark ? 1 : 0);

  useEffect(() => () => petalGeometry.dispose(), [petalGeometry]);

  // Species colours are written once. They are per-INSTANCE, not per-vertex:
  // the material keeps vertexColors off and three switches the program to
  // instanced colour the moment instanceColor exists.
  //
  // The matrices are zeroed here too, and that is not belt-and-braces: three
  // seeds instanceMatrix to IDENTITY, so ten unit-scale petals sit stacked on
  // the world origin until the first frame writes over them. The frame loop
  // also declines to write anything at all while the mesh is dark-hidden, so
  // "the first frame" can be much later than mount.
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const col = new THREE.Color();
    DUMMY.scale.setScalar(0);
    DUMMY.updateMatrix();
    for (let i = 0; i < PETALS.length; i++) {
      m.setColorAt(i, col.set(PETALS[i]!.c));
      m.setMatrixAt(i, DUMMY.matrix);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ clock, camera }, delta) => {
    const m = mesh.current;
    if (!m) return;
    darkAmt.current = THREE.MathUtils.damp(
      darkAmt.current,
      dark ? 1 : 0,
      DARK_LAMBDA,
      delta,
    );
    const day = 1 - darkAmt.current;
    // Night costs one damp and one comparison — the mesh leaves the draw list
    // rather than being drawn at zero scale.
    m.visible = day > 0.02;
    if (!m.visible) return;

    // Absolute clock, never an accumulated delta: a phase summed from `delta`
    // runs at double speed on a 120 Hz display.
    const t = clock.elapsedTime;
    for (let i = 0; i < PETALS.length; i++) {
      const p = PETALS[i]!;
      const period = PERIODS[i % PAIRS]!;
      const phase = PHASES[i % PAIRS]! + (i < PAIRS ? 0 : 0.5);
      const u = THREE.MathUtils.euclideanModulo(t / period + phase, 1);
      // Age as a fraction of the LIFE, so it runs 0→1 in the air and past 1
      // while dormant. The envelope closes on its own out there, which is why
      // the dormant case needs no branch: the second smoothstep saturates and
      // the scale is exactly zero.
      const a = u / DUTY;
      const env =
        THREE.MathUtils.smoothstep(a, 0, 0.06) *
        (1 - THREE.MathUtils.smoothstep(a, 0.85, 1));
      const age = u * period;

      const wave = TAU * p.fh * t + FLUT_PH[i]!;
      const slip = SWAY * Math.cos(wave);
      DUMMY.position.set(
        camera.position.x + p.x + DRIFT_X * age + PERP_X * slip,
        MEADOW_GROUND_BASE +
          p.y -
          (p.y - LAND_Y) * a +
          FLUTTER_Y * Math.sin(wave),
        p.z + DRIFT_Z * age + PERP_Z * slip,
      );
      DUMMY.rotation.set(p.sa * t + SPIN_A_PH[i]!, p.sb * t + SPIN_B_PH[i]!, 0);
      DUMMY.scale.setScalar(env * day);
      DUMMY.updateMatrix();
      m.setMatrixAt(i, DUMMY.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      geometry={petalGeometry}
      args={[undefined, undefined, PETALS.length]}
      // They track the camera, so their authored bounds are meaningless and a
      // cull test would drop them mid-traverse.
      frustumCulled={false}
      // Never intercept a prop click: these cross in front of the shelf.
      raycast={() => null}
    >
      <meshBasicMaterial side={THREE.DoubleSide} vertexColors />
    </instancedMesh>
  );
}

/** Reduced motion gets no petals. There is no still version worth keeping —
 * ten motionless flecks hanging over the grass are worse than none. The gate
 * is read once at mount and lives in a wrapper so the drift's own hooks stay
 * unconditional. */
export default function Petals({ dark }: { dark: boolean }) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  if (reduced) return null;
  return <Drift dark={dark} />;
}
