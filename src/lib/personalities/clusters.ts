/** Deterministic k-means with farthest-point starts and Euclidean silhouette scores. */
export type ClusterPoint = { id: string; values: number[] };
const squaredDistance = (a: number[], b: number[]) =>
  a.reduce((sum, value, j) => sum + (value - b[j]!) ** 2, 0);

export function clusterProfiles(input: ClusterPoint[], requested?: number) {
  if (requested !== undefined && !Number.isFinite(requested)) return null;
  const points = [...input].sort((a, b) => a.id.localeCompare(b.id));
  if (
    points.length < 3 ||
    points.some(
      (p) =>
        p.values.length !== points[0]!.values.length ||
        !p.values.every(Number.isFinite),
    )
  )
    return null;
  const unique = new Set(points.map((p) => JSON.stringify(p.values))).size;
  const maximum = Math.min(6, points.length - 1, unique);
  if (maximum < 2) return null;
  const counts =
    requested === undefined
      ? Array.from({ length: maximum - 1 }, (_, i) => i + 2)
      : [Math.max(2, Math.min(maximum, Math.round(requested)))];
  const distances = points.map((a) =>
    points.map((b) => Math.sqrt(squaredDistance(a.values, b.values))),
  );
  const candidates = counts
    .map((k) => {
      let best:
        | { centroids: number[][]; assignments: number[]; inertia: number }
        | undefined;
      // Different deterministic first seeds reduce dependence on a single initialization.
      for (const start of points) {
        let centroids = [start.values.slice()];
        while (centroids.length < k) {
          const next = points.reduce(
            (best, p, i) => {
              const distance = Math.min(
                ...centroids.map((c) => squaredDistance(p.values, c)),
              );
              return distance > best.distance ? { i, distance } : best;
            },
            { i: 0, distance: -1 },
          );
          centroids.push(points[next.i]!.values.slice());
        }
        let assignments = points.map(() => -1);
        for (let iteration = 0; iteration < 100; iteration++) {
          const next = points.map((p) =>
            centroids.reduce(
              (best, c, i) =>
                squaredDistance(p.values, c) <
                squaredDistance(p.values, centroids[best]!)
                  ? i
                  : best,
              0,
            ),
          );
          if (next.every((v, i) => v === assignments[i])) break;
          assignments = next;
          centroids = centroids.map((old, i) => {
            const members = points.filter((_, j) => assignments[j] === i);
            return members.length
              ? old.map(
                  (_, j) =>
                    members.reduce((sum, p) => sum + p.values[j]!, 0) /
                    members.length,
                )
              : old;
          });
        }
        if (new Set(assignments).size !== k) continue;
        const inertia = points.reduce(
          (sum, p, i) =>
            sum + squaredDistance(p.values, centroids[assignments[i]!]!),
          0,
        );
        if (!best || inertia < best.inertia - 1e-10)
          best = { centroids, assignments, inertia };
      }
      if (!best) return null;
      const fit = best;
      const silhouettes = points.map((_, i) => {
        const own = points
          .map((__, j) => j)
          .filter((j) => j !== i && fit.assignments[j] === fit.assignments[i]);
        if (!own.length) return 0;
        const a =
          own.reduce((sum, j) => sum + distances[i]![j]!, 0) / own.length;
        const b = Math.min(
          ...fit.centroids.flatMap((__, cluster) => {
            if (cluster === fit.assignments[i]) return [];
            const members = points
              .map((___, j) => j)
              .filter((j) => fit.assignments[j] === cluster);
            return [
              members.reduce((sum, j) => sum + distances[i]![j]!, 0) /
                members.length,
            ];
          }),
        );
        return Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
      });
      // Number clusters by centroid, so input order and initialization don't rename them.
      const order = fit.centroids
        .map((_, i) => i)
        .sort((a, b) => {
          for (let j = 0; j < fit.centroids[a]!.length; j++) {
            const difference = fit.centroids[b]![j]! - fit.centroids[a]![j]!;
            if (Math.abs(difference) > 1e-8) return difference;
          }
          return a - b;
        });
      return {
        k,
        silhouette: silhouettes.reduce((sum, s) => sum + s, 0) / points.length,
        inertia: fit.inertia,
        clusters: order.map((original, index) => ({
          index,
          centroid: fit.centroids[original]!,
          members: points
            .filter((_, j) => fit.assignments[j] === original)
            .map((p) => p.id),
        })),
      };
    })
    .filter((candidate) => candidate !== null);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.silhouette - a.silhouette || a.k - b.k);
  return {
    ...candidates[0]!,
    maxClusters: maximum,
    candidates: candidates.map((c) => ({ k: c.k, silhouette: c.silhouette })),
  };
}
