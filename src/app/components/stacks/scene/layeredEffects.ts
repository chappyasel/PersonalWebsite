/** Claims a bounded effect slot without replacing a live layer while an idle
 * one remains. When every slot is occupied, the oldest layer is recycled. */
export function claimEffectLayer(
  starts: number[],
  now: number,
  duration: number,
): number {
  const reusable = starts.findIndex(
    (startedAt) => startedAt < 0 || now - startedAt > duration,
  );
  const slot =
    reusable >= 0
      ? reusable
      : starts.reduce(
          (oldest, startedAt, index) =>
            startedAt < starts[oldest]! ? index : oldest,
          0,
        );
  starts[slot] = now;
  return slot;
}

/** Converts absolute start times into shader-friendly ages; -1 is idle. */
export function effectLayerAges(
  starts: readonly number[],
  now: number,
  duration: number,
  target: number[] = new Array<number>(starts.length),
): number[] {
  for (let index = 0; index < starts.length; index += 1) {
    const startedAt = starts[index]!;
    const age = now - startedAt;
    target[index] = startedAt >= 0 && age >= 0 && age <= duration ? age : -1;
  }
  return target;
}
