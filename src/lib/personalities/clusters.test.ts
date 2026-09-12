import { describe, expect, it } from "vitest";

import { clusterProfiles } from "./clusters";
import { axisDescription } from "./interpretation";

describe("profile clustering", () => {
  const separated = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    values: [(i < 6 ? -10 : 10) + (i % 3) * 0.1, (i % 2) * 0.1, 0, 0, 0],
  }));
  it("recovers separated groups and chooses two clusters", () => {
    const result = clusterProfiles(separated)!;
    expect(result.k).toBe(2);
    expect(result.clusters.map((c) => c.members.length)).toEqual([6, 6]);
    expect(result.silhouette).toBeGreaterThan(0.98);
    expect(clusterProfiles([...separated].reverse())).toEqual(result);
  });
  it("assigns every profile exactly once, handles duplicates, and supports an explicit count", () => {
    const result = clusterProfiles(
      [...separated, { ...separated[0]!, id: "duplicate" }],
      3,
    )!;
    expect(result.k).toBe(3);
    expect(new Set(result.clusters.flatMap((c) => c.members)).size).toBe(13);
    expect(result.clusters.every((c) => c.members.length > 0)).toBe(true);
    expect(result.silhouette).toBeLessThanOrEqual(1);
    expect(result.silhouette).toBeGreaterThanOrEqual(-1);
    expect(
      clusterProfiles(separated.map((p) => ({ ...p, values: [0, 0] }))),
    ).toBeNull();
  });
  it("explains both directions from the actual axis loadings", () => {
    expect(axisDescription([0.7, 0, -0.6, 0, 0], 1)).toBe(
      "more open to new experiences, less outgoing",
    );
    expect(axisDescription([0.7, 0, -0.6, 0, 0], 1, -1)).toBe(
      "less open to new experiences, more outgoing",
    );
  });
});
