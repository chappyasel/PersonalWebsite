"use client";

// GLB prop loader for the curated CC0 set (see scripts/stacks-models.mjs).
// Three variants:
// - "atlas": CreativeTrio props ship stripped of their shared 128×128
//   palette atlas; ONE themed MeshStandardMaterial per theme (map =
//   /models/atlas-{theme}.png) is shared across every atlas prop, so the
//   whole set recolors with a ~0.8KB texture swap. Never tint atlas props
//   via material.color — it tints clock faces and pages too.
// - "recolor": the houseplants, stripped the same way but pointed at the
//   tiny-treats pair — a second shared atlas, otherwise identical.
// - "tinted": untextured props (Quaternius open book, the golf club) keep
//   their own materials; `tints` remaps colors by material name. Props with
//   a private texture (basketball) use "tinted" with `tintAll` to mute the
//   stock hue toward the palette.
// Every material is forced to metalness 0 / roughness ~0.7 — CreativeTrio
// ships 0.4/0.272, which reads as tinted chrome under our environment map.
import { INERT_HOVER, useStacks } from "../store";
import { useGLTF, useTexture } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeVertices } from "three-stdlib";

import { LIFT_LAMBDA } from "./Lift";
import { useInteractionClaimed } from "./interaction";
import {
  extractTriangles,
  findIslands,
  findSphereIsland,
  findSpinAxis,
} from "./islands";

/** Name of the node `spinPart` isolates. Animators find it by traversing the
 * subtree rather than through a prop, which keeps ModelProp's memo free of
 * caller-supplied objects — see the disposal note below for why that matters. */
export const SPIN_NODE = "stacks-spin";

export const ATLAS_URLS = ["/models/atlas-light.png", "/models/atlas-dark.png"];

export const MODEL_URLS = [
  "/models/desk-lamp.glb",
  "/models/mug.glb",
  "/models/alarm-clock.glb",
  "/models/headphones.glb",
  "/models/dumbbell.glb",
  "/models/globe.glb",
  "/models/trophy.glb",
  "/models/open-book.glb",
  "/models/golf-club.glb",
  "/models/basketball.glb",
  "/models/ct-books.glb",
  "/models/cup-tea.glb",
  "/models/corkboard.glb",
  "/models/grandfather-clock.glb",
  "/models/ladder.glb",
  "/models/sansevieria.glb",
  "/models/potted-plant.glb",
  "/models/pothos.glb",
  "/models/barbell.glb",
  "/models/kettlebell.glb",
  // v5 additions. These six are placed by unit files but were never in the
  // preload batch, so they arrived after the first paint and popped in one at
  // a time; the eames-chair is also the seat's click target, which made its
  // late arrival an interaction gap rather than only a visual one.
  // `armchair.glb` came the other way: preloaded, and placed by nothing since
  // the About chair was swapped for the eames. This list is the placed set.
  "/models/eames-chair.glb",
  "/models/monstera.glb",
  "/models/cactus.glb",
  "/models/lamp-floor.glb",
  "/models/lamp-table.glb",
  "/models/mac.glb",
];

/** Isa Lousberg's houseplants are a second atlas set: every prop in it
 * samples ONE shared texture, so the palette-remapped pair themes all of
 * them at once — same mechanism and same ~2KB as the CreativeTrio atlas.
 * The pipeline refuses to build a `recolor` prop that doesn't match it. */
export const RECOLOR_URLS = [
  "/models/tiny-treats-light.png",
  "/models/tiny-treats-dark.png",
];

// One shared material per themed atlas texture (drei caches the texture by
// URL, so the uuid is stable across every ModelProp instance).
const atlasMaterials = new Map<string, THREE.MeshStandardMaterial>();

function atlasMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial {
  let mat = atlasMaterials.get(tex.uuid);
  if (!mat) {
    tex.flipY = false; // glTF UV convention — drei's loader defaults to flipped
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0,
      roughness: 0.7,
      // COLOR_0 carries the pipeline's baked vertex AO (--ao). Meshes
      // without it get a white fill in ModelProp — an unbound color
      // attribute would render black.
      vertexColors: true,
    });
    // Cached and reused by every atlas prop — never disposable.
    mat.userData.shared = true;
    atlasMaterials.set(tex.uuid, mat);
  }
  return mat;
}

/**
 * Pull the ball out of a single-mesh globe so it can turn inside its own ring.
 *
 * The prop arrives as ONE mesh — base, stem, two axle pins, meridian ring and
 * ball, 478 triangles, one material — so the parts have to be recovered from
 * connectivity (see ./islands). The ball is identified by SHAPE, never by
 * index: it is the island whose bounding box is cubic (1.000 against 0.394 for
 * the next nearest), because traversal order is an exporter artifact and the
 * next re-export through scripts/stacks-models.mjs could reorder it silently.
 *
 * Layout produced:
 *   root
 *     ├ mesh            everything except the ball, untouched
 *     └ group           at the ball's centre, tilted so +Y is the axle
 *         └ SPIN_NODE   an animator writes rotation.y here
 *             └ mesh    the ball, baked into that frame
 *
 * The ball never collides with the ring it turns inside, at any angle: it is a
 * sphere rotating about an axis through its own centre, so it maps onto
 * itself. The axle tilt is therefore about how it READS — a globe spinning
 * bolt upright looks like a ball on a spike — rather than about clearance.
 * The pivot is the BALL's centre with the pins' DIRECTION: the pin midpoint
 * sits ~0.001 off the ball centre, which would otherwise wobble.
 *
 * Detection failure leaves the prop whole and logs. An animator then turns the
 * entire globe, which is the old behaviour and merely less good — the outcome
 * worth preventing is silently spinning the stand.
 */
function splitSpinPart(root: THREE.Object3D): void {
  type PropMesh = THREE.Mesh<
    THREE.BufferGeometry,
    THREE.Material | THREE.Material[]
  >;
  const meshes: PropMesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o as PropMesh);
  });
  const mesh = meshes[0];
  if (meshes.length !== 1 || !mesh) {
    console.error(
      `[stacks] spinPart: expected one mesh, found ${meshes.length}. Prop left whole.`,
    );
    return;
  }

  const geometry = mesh.geometry;
  const islands = findIslands(geometry);
  const total = islands.reduce((n, i) => n + i.triangles.length, 0);
  const ball = findSphereIsland(islands, total);
  if (!ball) {
    console.error(
      `[stacks] spinPart: no spherical island among ${islands.length} ` +
        `(best sphericity ${Math.max(...islands.map((i) => i.sphericity)).toFixed(2)}). ` +
        "Prop left whole — run `node scripts/stacks-render.mjs <name> --report` to see the islands.",
    );
    return;
  }

  const { axis, tiltDegrees, derived } = findSpinAxis(islands, ball);
  if (!derived) {
    console.warn(
      "[stacks] spinPart: no axle pins found; spinning the ball about vertical.",
    );
  }

  const rest = islands
    .filter((i) => i !== ball)
    .flatMap((i) => i.triangles)
    .sort((a, b) => a - b);
  // +Y of the spin frame onto the axle; the inverse bakes the ball into it.
  const align = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    axis,
  );
  const ballGeometry = extractTriangles(
    geometry,
    ball.triangles,
    ball.center,
    align.clone().invert(),
  );
  const restGeometry = extractTriangles(geometry, rest);

  const ballMesh = new THREE.Mesh(ballGeometry, mesh.material);
  ballMesh.castShadow = mesh.castShadow;
  ballMesh.receiveShadow = mesh.receiveShadow;

  const spin = new THREE.Group();
  spin.name = SPIN_NODE;
  spin.add(ballMesh);

  const mount = new THREE.Group();
  mount.position.copy(ball.center);
  mount.quaternion.copy(align);
  mount.add(spin);

  mesh.geometry = restGeometry;
  mesh.add(mount);
  // Keep the mount in the mesh's own frame — it is a child of the mesh, and
  // the mesh may carry a transform from the GLB's node graph.
  mount.updateMatrixWorld(true);

  if (process.env.NODE_ENV === "development") {
    console.info(
      `[stacks] spinPart: ball ${ball.triangles.length}/${total} tris, ` +
        `sphericity ${ball.sphericity.toFixed(3)}, axle tilt ${tiltDegrees.toFixed(1)}°`,
    );
  }
}

/** Default floor motion. 2.2 cm of rise reads from a camera sitting ~2° above
 * the shelf line; the swell alone does not, which is why there is a lift at
 * all. Both sit UNDER links.tsx's DEFAULT_LIFT (3 cm + 2 cm toward the
 * viewer) on purpose — a prop that opens a page should still out-move one
 * that only acknowledges you. */
const FLOOR_LIFT = 0.022;
const FLOOR_GROW = 1.015;

/** Twin of the helper in eggs.tsx (not exported there). */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Wrapper-group name for the floor: `prop:<model>`. Named because pixels
 * cannot say WHICH object moved — the harness reads the transform through
 * `window.__stacks.node()`, the same reason SPIN_NODE has a name. */
export function hoverNodeName(url: string): string {
  return `prop:${
    url
      .split("/")
      .pop()
      ?.replace(/\.glb$/, "") ?? "model"
  }`;
}

/**
 * Backstop for interaction shells that predate `InteractionClaim`: ask the
 * live scene graph whether an ancestor already handles hover. r3f's own event
 * dispatcher reads exactly this field to decide which objects an event bubbles
 * through (`__r3f.handlers`), so the answer is the dispatcher's own. Every
 * hover shell in this scene — EggTrigger, LampSwitch, HoverShell, Grabbable —
 * is an `onPointerOver` on a group, and nothing in the scene uses
 * onPointerMove or onPointerEnter, so this one key is the whole surface.
 */
function ancestorHandlesHover(from: THREE.Object3D): boolean {
  type Instance = { handlers?: Record<string, unknown> };
  for (let o = from.parent; o; o = o.parent) {
    const instance = (o as THREE.Object3D & { __r3f?: Instance }).__r3f;
    if (instance?.handlers?.onPointerOver) return true;
  }
  return false;
}

/**
 * Is this prop lit by a rig authored AROUND it rather than inside it?
 *
 * The floor lamp on Talks is the pattern: the ModelProp is one child of a
 * group, and its spotLight, two glow sprites and two emissive shade discs are
 * SIBLINGS placed in the parent's frame at heights measured off the model
 * (SHADE_BOTTOM_Y / SHADE_TOP_Y). Move the model and it slides out of its own
 * light, which stays behind. The swell decouples it too — 1.5% of a 1.4-unit
 * lamp is 2 cm at the shade — so a prop like this gets no floor at all rather
 * than a lift-free one.
 *
 * Proximity is what makes this safe to ask. "Does my parent contain lights?"
 * is far too blunt: the mug on About shares its group with the desk lamp's
 * whole rig, and would lose its floor for standing next to a lamp. A light
 * that is PART of a prop sits inside that prop's own bounding box, so the test
 * is containment, not kinship. Two levels up, because the rig is often a
 * sibling of the trigger that wraps the model rather than of the model itself.
 */
function litByOwnRig(group: THREE.Object3D, box: THREE.Box3): boolean {
  const near = box.clone().expandByScalar(0.02);
  // Real lights only, never sprites, and that is a measured decision rather
  // than an oversight. ContactShade and FootPool are camera-facing SPRITES
  // hugging a prop's base and nearly every prop on these shelves has one, so
  // counting sprites disabled the floor almost everywhere it should apply. A
  // contact shadow staying on the wood is the correct reading of a lift
  // anyway — the object is rising off it. Excluding sprites by height instead
  // fails on the hanging pothos, whose model is offset −0.144 so its own shade
  // sits near the TOP of its box. Nothing is lost: every glow sprite in this
  // scene accompanies a real light (see the floor lamp's rig and LampGlow), so
  // the lights alone already identify every prop that owns a lighting rig.
  const world = new THREE.Vector3();
  let found = false;
  const scan = (o: THREE.Object3D) => {
    if (found || o === group) return; // never our own subtree
    if (
      (o as THREE.Light).isLight === true &&
      near.containsPoint(o.getWorldPosition(world))
    ) {
      found = true;
      return;
    }
    for (const child of o.children) scan(child);
  };
  let scope: THREE.Object3D | null = group.parent;
  for (let up = 0; up < 2 && scope && !found; up++, scope = scope.parent) {
    for (const child of scope.children) scan(child);
  }
  return found;
}

/**
 * Greatest world-space dimension, in scene units, above which a prop is
 * furniture and stops answering the pointer with a bob. The rule the owner
 * drew: the floor is for small shelf objects a person would pick up, and
 * furniture must not move when the pointer crosses it.
 *
 * A WORLD measurement taken after every scale in the chain, because `scale` is
 * a multiplier over source models that differ by an order of magnitude and
 * means nothing on its own — the floor lamp is scaled 1.67 and the mug 2.1,
 * and the lamp is three times the object.
 *
 * Measured, not guessed. Every GLB prop in the world, greatest world dimension
 * in scene units:
 *
 *   alarm-clock  0.269   desk-lamp    0.645  │  eames-chair       0.892
 *   cup-tea      0.366   lamp-table   0.650  │  golf-club         1.056
 *   headphones   0.408   pothos       0.664  │  ladder            1.259
 *   mug          0.418   basketball   0.670  │  lamp-floor        1.436
 *   potted-plant 0.471   cactus       0.696  │  monstera          1.691
 *                                            │  grandfather-clock 1.869
 *
 * The population is bimodal and the classes are exactly the semantic ones:
 * everything at or below 0.696 is something you would pick up off a shelf, and
 * everything at or above 0.892 is furniture. 0.78 sits in that empty band with
 * ~12% of margin on each side.
 *
 * Note this is deliberately looser than "30 cm on a shelf" (0.60 units at the
 * shelves' 2.00 units per metre), which the measurements rule out: it would
 * have cut the desk lamp, the table lamp, the basketball, the pothos and the
 * cactus, all of which are shelf objects. One threshold also covers both house
 * scales without special-casing, because nothing at the ~0.99 units-per-metre
 * floor scale comes anywhere near it — the armchair, the smallest of them,
 * is 0.90 m of real chair.
 */
const FLOOR_MAX_SIZE = 0.78;

/** Whether a prop that asked for the floor gets it, and why not if it doesn't.
 * `size` is reported either way — it is what the dev log is for. */
function floorVerdict(
  group: THREE.Object3D,
  force: boolean,
): { reason: string | null; size: number } {
  // Measure before testing anything, so the dev log reports a size for every
  // prop in the world and not only the ones that survive the earlier gates —
  // the size cutoff below was chosen off exactly that census.
  //
  // World, not local: ancestors carry the unit pose and the two house scales
  // (2.00 units/m on the shelves, ~0.96 on the floor). updateWorldMatrix first
  // — this runs before the first frame, so the matrices up the chain have not
  // necessarily been composed yet.
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return { reason: "empty", size: 0 };
  const s = box.getSize(new THREE.Vector3());
  const size = Math.max(s.x, s.y, s.z);
  if (ancestorHandlesHover(group)) return { reason: "shell", size };
  if (litByOwnRig(group, box)) return { reason: "rig", size };
  if (!force && size > FLOOR_MAX_SIZE) return { reason: "furniture", size };
  return { reason: null, size };
}

/**
 * The interaction floor: a prop that has no other answer at least
 * acknowledges the pointer. A damped rise of a couple of centimetres and a
 * swell you would not notice on its own, easing on Lift's curve so the whole
 * world settles alike.
 *
 * Hover state lives in refs and drives the group inside useFrame — no React
 * render per pointer move, the rule the rest of this scene is built on (see
 * Lift). At rest the frame callback compares two numbers and returns, so an
 * untouched prop costs nothing.
 *
 * The swell pivots at the prop's OWN base, not the wrapper's origin: the
 * primitive keeps whatever `position` the caller gave it, so scaling the
 * wrapper would drag a prop standing 1.3 m along the shelf sideways by 2 cm —
 * a slide, not a swell. Undoing that by the same factor scales about the
 * child's origin, which is where the prop meets the wood.
 */
function HoverFloor({
  name,
  lift,
  grow,
  force,
  children,
}: {
  name: string;
  lift: number;
  grow: number;
  force: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const hovered = useRef(false);
  const rise = useRef(0);
  const swell = useRef(1);
  const still = useMemo(() => reducedMotion(), []);
  // Resolved once, after the tree has committed — the prop is attached and
  // measurable by then, every shell above it has its handlers, and a mounted
  // prop never changes parents. A prop that stands down drops its handlers
  // entirely rather than merely ignoring the pointer: with no handlers r3f
  // leaves it out of the raycast set (furniture is big geometry to hit-test
  // for nothing) AND out of the bubble chain, so the shell above it is reached
  // exactly as it was before this component existed.
  const [inert, setInert] = useState(false);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const { reason, size } = floorVerdict(g, force);
    if (reason) setInert(true);
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[stacks] floor ${name} size=${size.toFixed(3)} → ${reason ?? "ON"}`,
      );
    }
  }, [name, force]);
  // Claims the store's hover slot under the INERT prefix: the floor moves a
  // prop, it does not open anything, and a pointer finger over a prop with no
  // destination promises a click that never lands (see store.ts). The claim
  // still buys correct cursor arbitration against the props that DO open
  // something, and gives the harness something to read.
  const hoverKey = INERT_HOVER + useId();
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g || inert) return;
    const on = hovered.current && !still;
    const ty = on ? lift : 0;
    const ts = on ? grow : 1;
    if (Math.abs(rise.current - ty) + Math.abs(swell.current - ts) < 1e-4) {
      if (rise.current === ty && swell.current === ts) return; // settled
      rise.current = ty;
      swell.current = ts;
    } else {
      rise.current = THREE.MathUtils.damp(rise.current, ty, LIFT_LAMBDA, delta);
      swell.current = THREE.MathUtils.damp(
        swell.current,
        ts,
        LIFT_LAMBDA,
        delta,
      );
    }
    const base = g.children[0]?.position;
    const k = 1 - swell.current;
    g.scale.setScalar(swell.current);
    g.position.set(
      base ? base.x * k : 0,
      (base ? base.y * k : 0) + rise.current,
      base ? base.z * k : 0,
    );
  });
  // The group stays mounted either way — dropping it would re-parent the model
  // and churn the graph other systems cache nodes out of. Only the handlers go.
  const handlers = inert
    ? {}
    : {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation(); // or every prop behind this one lights up too
          hovered.current = true;
          useStacks.getState().setHovered(hoverKey);
        },
        onPointerOut: () => {
          hovered.current = false;
          // Clear only our own slot — a late out must never drop another
          // prop's freshly claimed hover (the house rule, see EggTrigger).
          if (useStacks.getState().hovered === hoverKey)
            useStacks.getState().setHovered(null);
        },
      };
  return (
    <group ref={ref} name={name} {...handlers}>
      {children}
    </group>
  );
}

export default function ModelProp({
  url,
  dark,
  variant = "atlas",
  tints,
  tintAll,
  roughness = 0.7,
  atlasOverride,
  smoothNormals,
  spinPart,
  hover = true,
  position,
  rotation,
  scale,
}: {
  url: string;
  dark: boolean;
  variant?: "atlas" | "tinted" | "recolor";
  /** tinted only: material name → hex color remap. */
  tints?: Record<string, string>;
  /** tinted only: multiply every material (and its texture) by this color. */
  tintAll?: string;
  roughness?: number;
  /** atlas only: clone the shared atlas material for THIS prop and adjust —
   * the trophy's metal exception, the dumbbell's iron darkening. Without
   * this every atlas prop shares one material, so never mutate that one. */
  atlasOverride?: { tint?: string; metalness?: number; roughness?: number };
  /** Weld + regenerate normals at load — the basketball ships faceted and
   * the node pipeline can't round-trip its embedded texture (GLTFExporter
   * needs a DOM to re-encode images). Position+uv-equal vertices merge;
   * normals regenerate smooth. */
  smoothNormals?: boolean;
  /** Isolate one part of a single-mesh prop into a node named SPIN_NODE that
   * an animator can rotate on its own — "sphere" pulls the globe's ball out
   * of its stand and ring. A plain string literal on purpose: this lands in
   * the memo deps below, and an object here would rebuild the model on every
   * parent render. */
  spinPart?: "sphere";
  /** Universal interaction floor, ON by default: a small prop with no other
   * answer still rises a little under the pointer.
   *
   * It stands down on its own for anything that should not bob — furniture (by
   * measured size), a prop lit by a rig of siblings, a prop inside a shell that
   * already handles the pointer, a prop with `spinPart`. Overridable in both
   * directions: `false` is an unconditional no, `{ force: true }` puts the
   * floor on a prop the size cutoff would have excluded. `{ lift, grow }` tunes
   * the motion — a heavy prop wants a smaller lift rather than none. */
  hover?: boolean | { lift?: number; grow?: number; force?: boolean };
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  const { scene } = useGLTF(url, false);
  // Two atlas sets, one code path: recolor props sample the tiny-treats
  // pair, everything else the CreativeTrio pair. Same hook, same cache.
  const atlases = useTexture(variant === "recolor" ? RECOLOR_URLS : ATLAS_URLS);
  // Read here, used only by the wrapper below — the hover floor deliberately
  // owns no state that could reach the memo's deps.
  const claimed = useInteractionClaimed();
  const object = useMemo(() => {
    const clone = scene.clone(true);
    if (variant === "atlas" || variant === "recolor") {
      let mat = atlasMaterial(atlases[dark ? 1 : 0]!);
      if (atlasOverride) {
        mat = mat.clone();
        // Material.clone() deep-copies userData, so the clone would inherit
        // the shared tag and be skipped by disposal forever. It is this
        // prop's own material; it must be freed with this prop.
        mat.userData.shared = false;
        if (atlasOverride.tint) mat.color.set(atlasOverride.tint);
        if (atlasOverride.metalness !== undefined)
          mat.metalness = atlasOverride.metalness;
        if (atlasOverride.roughness !== undefined)
          mat.roughness = atlasOverride.roughness;
      }
      clone.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const geo = o.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position;
        if (!geo.attributes.color && pos) {
          geo.setAttribute(
            "color",
            new THREE.BufferAttribute(
              new Float32Array(3 * pos.count).fill(1),
              3,
            ),
          );
        }
        o.material = mat;
      });
    } else {
      clone.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const src = o.material as THREE.MeshStandardMaterial;
        const mat = src.clone();
        const tint = tints?.[src.name];
        if (tint) mat.color.set(tint);
        if (tintAll) mat.color.multiply(new THREE.Color(tintAll));
        mat.metalness = 0;
        mat.roughness = roughness;
        o.material = mat;
      });
    }
    if (spinPart === "sphere") splitSpinPart(clone);
    if (smoothNormals) {
      clone.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const geo = o.geometry as THREE.BufferGeometry;
        // Meshopt-decoded geometry is INTERLEAVED — mergeVertices silently
        // degenerates it to a zero bbox. De-interleave (dropping normals)
        // into plain attributes first, then weld + regenerate.
        const flat = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(geo.attributes)) {
          if (name === "normal") continue;
          const a = attr as THREE.BufferAttribute;
          const arr = new Float32Array(a.count * a.itemSize);
          for (let i = 0; i < a.count; i++)
            for (let c = 0; c < a.itemSize; c++)
              arr[i * a.itemSize + c] = a.getComponent(i, c);
          flat.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
        }
        if (geo.index) flat.setIndex(geo.index.clone());
        const welded = mergeVertices(flat);
        welded.computeVertexNormals();
        welded.userData.owned = true;
        o.geometry = welded;
      });
    }
    return clone;
  }, [
    scene,
    atlases,
    dark,
    variant,
    tints,
    tintAll,
    roughness,
    atlasOverride,
    smoothNormals,
    spinPart,
  ]);

  // Release what this memo allocated. `tints` and `atlasOverride` are inline
  // object literals at every call site, so their identity changes on ANY
  // parent re-render — a theme flip, a panel opening, the degrade ladder
  // stepping — and the memo rebuilds. Without this, each rebuild stranded a
  // fresh material per tinted mesh (and a welded geometry per smoothNormals
  // mesh) on the GPU, and nothing ever freed them.
  //
  // Only clones are disposed. The shared atlas material is cached by texture
  // uuid and reused across every atlas prop in the scene; disposing that
  // would blank them all, so it is tagged and skipped.
  useEffect(() => {
    const stale = object;
    return () => {
      stale.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mesh = o as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.Material | THREE.Material[]
        >;
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const m of mats) {
          const shared = (m.userData as { shared?: boolean }).shared === true;
          if (!shared) m.dispose();
        }
        const owned = (mesh.geometry.userData as { owned?: boolean }).owned;
        if (owned === true) mesh.geometry.dispose();
      });
    };
  }, [object]);
  const model = (
    <primitive
      object={object}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
  // Nothing wrapped, nothing subscribed to the frame loop, and the rendered
  // tree is byte-for-byte what it was before this prop existed. `spinPart` is
  // in here because the two motions fight: the wrapper would carry the stand
  // up with the ball, and the whole point of splitSpinPart is that the stand
  // holds still.
  if (hover === false || claimed || spinPart) return model;
  const tune = hover === true ? null : hover;
  return (
    <HoverFloor
      name={hoverNodeName(url)}
      lift={tune?.lift ?? FLOOR_LIFT}
      grow={tune?.grow ?? FLOOR_GROW}
      force={tune?.force ?? false}
    >
      {model}
    </HoverFloor>
  );
}

/** Fire-and-forget prefetch of the full prop set (~300KB incl. atlases and
 * recolor textures) — called once after the world mounts so props pop in
 * together instead of trickling per-unit. */
export function preloadModels() {
  for (const url of MODEL_URLS) useGLTF.preload(url, false);
  useTexture.preload(ATLAS_URLS);
  useTexture.preload(RECOLOR_URLS);
}
