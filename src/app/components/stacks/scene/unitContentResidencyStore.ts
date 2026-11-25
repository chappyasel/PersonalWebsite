// Which shelves have their contents mounted.
//
// The boot reveal waits for every asset the loading manager has seen. With
// all seven shelves mounted at boot, that meant every shelf's models,
// textures, and photos had to arrive and decode before the arrival shelf
// could show, in 8 to 10 consecutive batches (docs/plans/room-boot-speed.md).
// Before the room is live, only the arrival shelf and its neighbours mount
// their contents, so the gate waits on those alone. Once the room is live the
// rest mount one at a time, nearest first, each after the previous batch has
// settled and outside travel. A shelf the camera comes near mounts at once.
// Mounted shelves never unmount.
//
// The unit root group stays mounted throughout: activity, physics, and insect
// collision register against it, and pick up late children on their own
// schedules (physics at grab time, insects on their index refresh).
import {
  UNITS,
  UNIT_COUNT,
  type UnitSlug,
  initialScenePositionFromLocation,
} from "../data";
import { useStacks } from "../store";
import { useSyncExternalStore } from "react";

import { screenshotModeController } from "./screenshotMode";

/** The arrival shelf and its neighbours, clamped to the room. */
export function nearUnits(active: number, count = UNIT_COUNT): number[] {
  const center = Math.min(count - 1, Math.max(0, Math.round(active)));
  return [center - 1, center, center + 1].filter(
    (index) => index >= 0 && index < count,
  );
}

/** The unmounted shelf nearest the camera, ties broken toward the right
 * (the direction a first visit travels). Null once every shelf is mounted. */
export function nextUnitToMount(
  mounted: ReadonlySet<number>,
  active: number,
  count = UNIT_COUNT,
): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let index = 0; index < count; index++) {
    if (mounted.has(index)) continue;
    const distance = Math.abs(index - active);
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && index > best)
    ) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** Deferral is for a visitor's boot. Captures and the measurement harness
 * expect the whole room on their first ready frame, and `?units=all` restores
 * the old whole-room boot for a before-and-after measurement. */
export function unitContentDeferralAllowed(search: string): boolean {
  const params = new URLSearchParams(search);
  return (
    !params.has("screenshot") &&
    !params.has("harness") &&
    params.get("units") !== "all"
  );
}

/** The shelf this visit arrives on. RoomNavigation writes a deep link's
 * position into the store in an effect, after the scene's first render, so
 * the URL answers until it has. */
function arrivalUnit(): number {
  const { activeUnit } = useStacks.getState();
  if (activeUnit !== 0) return activeUnit;
  return Math.round(
    initialScenePositionFromLocation(
      window.location.pathname,
      window.location.hash,
    ),
  );
}

// Asset preloads that belong to one shelf. A shelf module used to preload at
// chunk evaluation, which put every shelf's assets into the boot's loading
// batch whether or not the shelf was mounted. Registered here, they start when
// their shelf mounts instead.
const pendingPreloads = new Map<UnitSlug, Array<() => void>>();
const releasedShelves = new Set<UnitSlug>();

/** Run `preload` once the shelf `slug` mounts, or now if it already has. */
export function preloadWithUnit(slug: UnitSlug, preload: () => void) {
  if (releasedShelves.has(slug)) {
    preload();
    return;
  }
  const queued = pendingPreloads.get(slug);
  if (queued) queued.push(preload);
  else pendingPreloads.set(slug, [preload]);
}

function releaseUnitPreloads(indexes: Iterable<number>) {
  if (typeof window === "undefined") return;
  const slugs: UnitSlug[] = [];
  for (const index of indexes) {
    const slug = UNITS[index]?.slug;
    if (!slug || releasedShelves.has(slug)) continue;
    releasedShelves.add(slug);
    slugs.push(slug);
  }
  if (slugs.length === 0) return;
  // Mounting can happen inside a render (a store snapshot); starting a load
  // there would update the loading-progress store mid-render.
  queueMicrotask(() => {
    for (const slug of slugs) {
      const queued = pendingPreloads.get(slug);
      pendingPreloads.delete(slug);
      for (const preload of queued ?? []) preload();
    }
  });
}

class UnitContentResidency {
  private mounted: Set<number> | null = null;
  private readonly listeners = new Set<() => void>();

  private ensure(): Set<number> {
    if (this.mounted) return this.mounted;
    const deferral =
      typeof window !== "undefined" &&
      unitContentDeferralAllowed(window.location.search) &&
      !screenshotModeController.getSnapshot().enabled;
    this.mounted = new Set(
      deferral
        ? nearUnits(arrivalUnit())
        : Array.from({ length: UNIT_COUNT }, (_, index) => index),
    );
    releaseUnitPreloads(this.mounted);
    return this.mounted;
  }

  readonly isMounted = (index: number) => this.ensure().has(index);

  allMounted() {
    return this.ensure().size >= UNIT_COUNT;
  }

  mount(indexes: readonly number[]) {
    const mounted = this.ensure();
    let changed = false;
    for (const index of indexes) {
      if (index < 0 || index >= UNIT_COUNT || mounted.has(index)) continue;
      mounted.add(index);
      changed = true;
    }
    if (!changed) return;
    releaseUnitPreloads(indexes);
    for (const listener of this.listeners) listener();
  }

  mountAll() {
    this.mount(Array.from({ length: UNIT_COUNT }, (_, index) => index));
  }

  next(active: number) {
    return nextUnitToMount(this.ensure(), active);
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const unitContentResidency = new UnitContentResidency();

export function useUnitContentMounted(index: number): boolean {
  return useSyncExternalStore(
    unitContentResidency.subscribe,
    () => unitContentResidency.isMounted(index),
    () => true,
  );
}

/** Whether every shelf has mounted, for the Scene Diagnostics switch and the
 * light padding. */
export function useAllUnitContentMounted(): boolean {
  return useSyncExternalStore(
    unitContentResidency.subscribe,
    () => unitContentResidency.allMounted(),
    () => true,
  );
}
