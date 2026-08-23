"use client";

import { devSubdomainUrl } from "../../../../lib/util";
import type * as THREE from "three";

import type { DynamicColliderProfile } from "./physicsColliders";

export type MassClass = "light" | "medium" | "heavy" | "massive";

export type MovableSpec = {
  massKg: number;
  massClass: MassClass;
  colliderProfile?: DynamicColliderProfile;
};

export type DoorSpec = {
  kind: "door";
  /** The title line: where the Door goes, or what the object is. */
  label: string;
  /** Optional lines under the title: what the object stands for (a role, a
   * year). Each entry is its own line in the Door Label; the title alone
   * still names the destination. */
  detail?: readonly string[];
  href?: string;
  run?: () => void;
  external: boolean;
};

export type ActionSpec = {
  kind: "action";
  /** What the stationary activation does, as a verb phrase ("Read book
   * notes", "Hit golf ball"). With a `title` it is the label's last line;
   * without one it is the whole label. */
  label: string;
  /** Optional title line naming the object the action concerns (a book's
   * title), with `detail` lines (its author) between it and the verb. */
  title?: string;
  detail?: readonly string[];
  run: () => void;
};

export type EggSpec = {
  kind: "egg";
  run: () => void;
  reducedMotion: "skip" | "state-only";
};

export type HoverResponseSpec = {
  kind: "lift" | "tilt" | "shimmer" | "none";
};

export type ProjectedLocalBounds = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

/** Imperative seam used by the coarse-pointer arbiter. Grabbable remains the
 * owner of authored/solver motion; the DOM layer only decides when it begins. */
export type MovableController = {
  press: (event: PointerEvent) => boolean;
  pickup: (event: PointerEvent) => void;
  move: (event: PointerEvent) => void;
  release: (
    event: PointerEvent,
    velocityMultiplier: number,
    cap: number,
  ) => void;
  cancel: (event?: PointerEvent) => void;
};

export type SceneInteractionSpec = {
  id: string;
  label?: string;
  showLabel?: boolean;
  /** False for registry-only geometry such as shelf planks that own insect
   * perches but must not compete with authored props for Touch Focus. */
  touchable?: boolean;
  /** Skip Touch Focus and run this interaction on the first stationary tap. */
  activateOnFirstTouch?: boolean;
  root: THREE.Object3D;
  activeUnits: number[];
  touchPriority?: number;
  projectedLocalBounds?: ProjectedLocalBounds;
  movable?: MovableSpec;
  movableController?: MovableController;
  activation?: DoorSpec | ActionSpec | EggSpec;
  hover?: HoverResponseSpec;
};

export type PropDestination =
  | "books"
  | "weightlifting"
  | "liarsdice"
  | "manual"
  | "routine"
  | "blog";

type Destination = Pick<DoorSpec, "label" | "external"> & { href: string };

/** One destination table owns route hrefs, wording, and external treatment.
 * A Door Label names the destination and nothing else: the label's arrow (→
 * inside the site, ↗ out of it) already says it goes somewhere, so "Open" and
 * "Visit" were filler (owner, 2026-08-22). */
export function destinationFor(to: PropDestination): Destination {
  const prod = process.env.NODE_ENV === "production";
  switch (to) {
    case "books":
      return {
        href: prod ? "https://books.chappyasel.com" : devSubdomainUrl("books"),
        label: "Book Notes",
        external: false,
      };
    case "weightlifting":
      return {
        href: prod
          ? "https://weightlifting.chappyasel.com"
          : devSubdomainUrl("weightlifting"),
        label: "Weightlifting",
        external: false,
      };
    case "liarsdice":
      return {
        href: "/liarsdice",
        label: "Liar's Dice",
        external: false,
      };
    case "manual":
      return {
        href: "/manual",
        label: "Personal Manual",
        external: false,
      };
    case "routine":
      return {
        href: "/routine",
        label: "Core Daily Routine",
        external: false,
      };
    case "blog":
      return {
        href: "https://medium.com/@chappyasel",
        label: "Medium",
        external: true,
      };
  }
}

export function massClassFor(massKg: number): MassClass {
  if (massKg <= 1) return "light";
  if (massKg <= 5) return "medium";
  if (massKg <= 20) return "heavy";
  return "massive";
}

export const MASS_HANDLING = {
  light: {
    followLambda: 22,
    maxRaise: 1.5,
    minDrop: -1.5,
    throwTilt: 1,
  },
  medium: {
    followLambda: 18,
    maxRaise: 1,
    minDrop: -1.5,
    throwTilt: 0.8,
  },
  heavy: {
    followLambda: 13,
    maxRaise: 0.6,
    minDrop: -1.2,
    throwTilt: 0.45,
  },
  massive: {
    followLambda: 9,
    maxRaise: 0.25,
    minDrop: -0.5,
    throwTilt: 0.2,
  },
} as const;

const interactionParts = new Map<string, Map<symbol, SceneInteractionSpec>>();
const registrySubscribers = new Set<() => void>();

function publishRegistryChange() {
  for (const subscriber of registrySubscribers) subscriber();
}

export function subscribeSceneInteractions(subscriber: () => void) {
  registrySubscribers.add(subscriber);
  return () => registrySubscribers.delete(subscriber);
}

function composeInteraction(id: string): SceneInteractionSpec | null {
  const parts = interactionParts.get(id);
  if (!parts?.size) return null;
  const all = [...parts.values()];
  const movablePart = all.find((part) => part.movable);
  const activationPart = all.find((part) => part.activation);
  const hoverPart = all.find((part) => part.hover);
  return {
    id,
    label:
      all.find((part) => part.label)?.label ??
      (activationPart?.activation?.kind === "door" ||
      activationPart?.activation?.kind === "action"
        ? activationPart.activation.label
        : id),
    showLabel: all.every((part) => part.showLabel !== false),
    touchable: all.some((part) => part.touchable !== false),
    activateOnFirstTouch: all.some((part) => part.activateOnFirstTouch),
    // A carrier owns projection and touch hit-testing when a nested trigger
    // contributes activation separately (the alarm clock is the canonical
    // movable + egg case).
    root: movablePart?.root ?? activationPart?.root ?? all[0]!.root,
    activeUnits: [...new Set(all.flatMap((part) => part.activeUnits))],
    touchPriority: Math.max(...all.map((part) => part.touchPriority ?? 0)),
    projectedLocalBounds:
      movablePart?.projectedLocalBounds ??
      activationPart?.projectedLocalBounds ??
      all[0]?.projectedLocalBounds,
    movable: movablePart?.movable,
    movableController: movablePart?.movableController,
    activation: activationPart?.activation,
    hover: hoverPart?.hover,
  };
}

export function registerSceneInteraction(spec: SceneInteractionSpec) {
  const token = Symbol(spec.id);
  const parts =
    interactionParts.get(spec.id) ?? new Map<symbol, SceneInteractionSpec>();
  parts.set(token, spec);
  interactionParts.set(spec.id, parts);
  publishRegistryChange();
  return () => {
    const current = interactionParts.get(spec.id);
    current?.delete(token);
    if (!current?.size) interactionParts.delete(spec.id);
    publishRegistryChange();
  };
}

export function runSceneInteractionActivation(id: string) {
  const activation = getSceneInteraction(id)?.activation;
  if (!activation) return false;
  if (activation.kind === "door") {
    if (!activation.run) return false;
    activation.run();
  } else {
    activation.run();
  }
  return true;
}

export function getSceneInteraction(id: string | null) {
  return id ? composeInteraction(id) : null;
}

/**
 * Every root registered under `id`, not just the one `composeInteraction`
 * elects.
 *
 * One prop is often registered twice — `Grabbable` contributes the movable
 * part and a nested `SpinProp`/`EggTrigger` contributes the activation — and
 * composition has to pick a single carrier for projection and hit-testing, so
 * it prefers the movable one. That is right for pointing at a prop and wrong
 * for measuring it: the elected root can be a handle with no geometry under it,
 * and anything asking "where is the top of this prop" then gets an empty box.
 *
 * Measured on the live page: `egg:globe` reported no visible bounds at all, and
 * `grab:barbell` and `training:kettlebell-handle` reported them intermittently
 * — which is exactly how often a Perch on those props was reachable. Unioning
 * the parts is what makes the question answerable without changing which root
 * owns the interaction.
 */
export function sceneInteractionRoots(id: string) {
  const parts = interactionParts.get(id);
  if (!parts?.size) return [];
  return [...new Set([...parts.values()].map((part) => part.root))];
}

export function sceneInteractionInventory() {
  return [...interactionParts.keys()]
    .map(composeInteraction)
    .filter((spec): spec is SceneInteractionSpec => spec !== null);
}

export function doorDisplayLabel(door: DoorSpec) {
  const base = door.label.replace(/\s*↗\s*$/, "");
  return door.external ? `${base} ↗` : base;
}

/** A label describes the primary stationary activation. Quiet eggs stay
 * undisclosed, but a local action is just as clickable as navigation and must
 * not lose its authored outcome merely because the same prop is movable. */
export function doorLabelActivation(
  spec: SceneInteractionSpec | null,
): DoorSpec | ActionSpec | null {
  if (spec?.showLabel === false) return null;
  return spec?.activation?.kind === "door" ||
    spec?.activation?.kind === "action"
    ? spec.activation
    : null;
}

export function cursorForInteraction(
  id: string | null,
  dragging: string | null,
): "" | "grab" | "grabbing" | "pointer" {
  if (dragging) return "grabbing";
  if (id?.startsWith("golf-club:") || id?.startsWith("golf-ball:"))
    return "pointer";
  const spec = getSceneInteraction(id);
  if (!spec) return "";
  if (spec.activation) return "pointer";
  if (spec.movable) return "grab";
  return "";
}

export type ProjectedDoor = {
  x: number;
  y: number;
  behind: boolean;
};

type DoorProjectionResolver = (id: string) => ProjectedDoor | null;
let projectionResolver: DoorProjectionResolver | null = null;

/** The lazy scene installs its Three-dependent resolver after the renderer is
 * ready. This dependency-free bridge keeps `three` out of the DOM bundle. */
export function setDoorProjectionResolver(
  resolver: DoorProjectionResolver | null,
) {
  projectionResolver = resolver;
}

export function projectDoor(id: string): ProjectedDoor | null {
  return projectionResolver?.(id) ?? null;
}

declare global {
  interface Window {
    __sceneInteractions?: () => Array<{
      id: string;
      units: number[];
      movable: boolean;
      activation: "door" | "action" | "egg" | null;
      label: string | null;
    }>;
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.__sceneInteractions = () =>
    sceneInteractionInventory().map((spec) => ({
      id: spec.id,
      units: spec.activeUnits,
      movable: Boolean(spec.movable),
      activation: spec.activation?.kind ?? null,
      label:
        spec.activation?.kind === "door"
          ? doorDisplayLabel(spec.activation)
          : spec.activation?.kind === "action"
            ? spec.activation.label
            : null,
    }));
}
