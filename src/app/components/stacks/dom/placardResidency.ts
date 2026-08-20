/** Prioritize the documents a visitor can reach with the least travel.
 * The active document is first, then the nearest unit on each side. */
export function placardPreparationOrder(activeUnit: number, unitCount: number) {
  if (unitCount <= 0) return [];

  const active = Math.min(unitCount - 1, Math.max(0, Math.trunc(activeUnit)));
  const order = [active];

  for (let distance = 1; order.length < unitCount; distance += 1) {
    const previous = active - distance;
    const next = active + distance;
    if (previous >= 0) order.push(previous);
    if (next < unitCount) order.push(next);
  }

  return order;
}

export function nextPlacardToPrepare(
  activeUnit: number,
  unitCount: number,
  prepared: ReadonlySet<number>,
) {
  return placardPreparationOrder(activeUnit, unitCount).find(
    (unit) => !prepared.has(unit),
  );
}
