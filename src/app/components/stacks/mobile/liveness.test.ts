import { describe, expect, it, vi } from "vitest";

import { claimArrivalBeat, haptic } from "./liveness";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("mobile liveness persistence", () => {
  it("claims an arrival once per session store", () => {
    const storage = memoryStorage();
    expect(claimArrivalBeat(storage, 0)).toBe(true);
    expect(claimArrivalBeat(storage, 0)).toBe(false);
    expect(claimArrivalBeat(storage, 1)).toBe(true);
  });

  it("uses best-effort haptics", () => {
    const vibrate = vi.fn(() => true);
    expect(haptic(12, vibrate)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(12);
    expect(
      haptic(8, () => {
        throw new Error("denied");
      }),
    ).toBe(false);
  });
});
