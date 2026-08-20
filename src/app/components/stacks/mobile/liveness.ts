const ARRIVAL_KEY = "stacks.arrivals.v1";

export function browserStorage(kind: "localStorage" | "sessionStorage") {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function readSet(storage: Storage | null, key: string): Set<string> {
  if (!storage) return new Set();
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(value) ? value.filter((x) => typeof x === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function writeSet(storage: Storage | null, key: string, value: Set<string>) {
  try {
    storage?.setItem(key, JSON.stringify([...value]));
  } catch {
    // Persistence is progressive enhancement in private/hardened contexts.
  }
}

export function claimArrivalBeat(storage: Storage | null, unit: number) {
  const seen = readSet(storage, ARRIVAL_KEY);
  const key = String(unit);
  if (seen.has(key)) return false;
  seen.add(key);
  writeSet(storage, ARRIVAL_KEY, seen);
  return true;
}

export function haptic(
  milliseconds: 6 | 8 | 12,
  vibrate?: (ms: number) => unknown,
) {
  try {
    const run =
      vibrate ??
      (typeof navigator === "undefined"
        ? undefined
        : navigator.vibrate?.bind(navigator));
    return Boolean(run?.(milliseconds));
  } catch {
    return false;
  }
}
