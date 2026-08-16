"use client";

import { devSubdomainUrl } from "../../../../lib/util";
import type * as THREE from "three";

export type MassClass = "light" | "medium" | "heavy" | "massive";

export type MovableSpec = {
  massKg: number;
  massClass: MassClass;
};

export type DoorSpec = {
  kind: "door";
  label: string;
  href?: string;
  run?: () => void;
  external: boolean;
};

export type EggSpec = {
  kind: "egg";
  run: () => void;
  reducedMotion: "skip" | "state-only";
};

export type HoverResponseSpec = {
  kind: "lift" | "tilt" | "shimmer" | "none";
};

export type SceneInteractionSpec = {
  id: string;
  root: THREE.Object3D;
  activeUnits: number[];
  movable?: MovableSpec;
  activation?: DoorSpec | EggSpec;
  hover?: HoverResponseSpec;
};

export type PropDestination =
  | "books"
  | "weightlifting"
  | "manual"
  | "routine"
  | "blog";

type Destination = Pick<DoorSpec, "label" | "external"> & { href: string };

/** One destination table owns route hrefs, wording, and external treatment. */
export function destinationFor(to: PropDestination): Destination {
  const prod = process.env.NODE_ENV === "production";
  switch (to) {
    case "books":
      return {
        href: prod ? "https://books.chappyasel.com" : devSubdomainUrl("books"),
        label: "Open Book Notes",
        external: false,
      };
    case "weightlifting":
      return {
        href: prod
          ? "https://weightlifting.chappyasel.com"
          : devSubdomainUrl("weightlifting"),
        label: "Open Weightlifting",
        external: false,
      };
    case "manual":
      return {
        href: "/manual",
        label: "Open Personal Manual",
        external: false,
      };
    case "routine":
      return {
        href: "/routine",
        label: "Open Core Daily Routine",
        external: false,
      };
    case "blog":
      return {
        href: "https://medium.com/@chappyasel",
        label: "Open Musings",
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
  light: { followLambda: 22, maxLift: 0.75, throwTilt: 1 },
  medium: { followLambda: 18, maxLift: 0.6, throwTilt: 0.8 },
  heavy: { followLambda: 13, maxLift: 0.38, throwTilt: 0.45 },
  massive: { followLambda: 9, maxLift: 0.2, throwTilt: 0.2 },
} as const;

const interactionParts = new Map<string, Map<symbol, SceneInteractionSpec>>();

function composeInteraction(id: string): SceneInteractionSpec | null {
  const parts = interactionParts.get(id);
  if (!parts?.size) return null;
  const all = [...parts.values()];
  const movablePart = all.find((part) => part.movable);
  const activationPart = all.find((part) => part.activation);
  const hoverPart = all.find((part) => part.hover);
  return {
    id,
    // A carrier owns projection and touch hit-testing when a nested trigger
    // contributes activation separately (the alarm clock is the canonical
    // movable + egg case).
    root: movablePart?.root ?? activationPart?.root ?? all[0]!.root,
    activeUnits: [...new Set(all.flatMap((part) => part.activeUnits))],
    movable: movablePart?.movable,
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
  return () => {
    const current = interactionParts.get(spec.id);
    current?.delete(token);
    if (!current?.size) interactionParts.delete(spec.id);
  };
}

export function getSceneInteraction(id: string | null) {
  return id ? composeInteraction(id) : null;
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

export function cursorForInteraction(
  id: string | null,
  dragging: string | null,
): "" | "grab" | "grabbing" | "pointer" {
  if (dragging) return "grabbing";
  const spec = getSceneInteraction(id);
  if (!spec) return "";
  if (spec.movable) return "grab";
  if (spec.activation) return "pointer";
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
      activation: "door" | "egg" | null;
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
          : null,
    }));
}
