import { type Scores, traits } from "./data";

export type PcaInput = { id: string; scores: Partial<Scores> };

/** Correlation PCA: center and scale each trait within the supplied cohort. */
export function personalityPca(input: PcaInput[]) {
  const rows = input.filter((row) =>
    traits.every((trait) => Number.isFinite(row.scores[trait])),
  );
  if (rows.length < 3) return null;
  const n = rows.length;
  const size = traits.length;
  const means = traits.map(
    (trait) => rows.reduce((sum, row) => sum + row.scores[trait]!, 0) / n,
  );
  const deviations = traits.map((trait, j) =>
    Math.sqrt(
      rows.reduce(
        (sum, row) => sum + (row.scores[trait]! - means[j]!) ** 2,
        0,
      ) /
        (n - 1),
    ),
  );
  const standardized = rows.map((row) =>
    traits.map((trait, j) =>
      deviations[j]! > 1e-10
        ? (row.scores[trait]! - means[j]!) / deviations[j]!
        : 0,
    ),
  );
  const matrix = traits.map((_, i) =>
    traits.map(
      (__, j) =>
        standardized.reduce((sum, row) => sum + row[i]! * row[j]!, 0) / (n - 1),
    ),
  );
  const vectors: number[][] = traits.map((_, i) =>
    traits.map((__, j) => (i === j ? 1 : 0)),
  );

  // Jacobi rotations diagonalize the symmetric 5×5 correlation matrix.
  for (let iteration = 0; iteration < 200; iteration++) {
    let p = 0,
      q = 1;
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        if (Math.abs(matrix[i]![j]!) > Math.abs(matrix[p]![q]!)) {
          p = i;
          q = j;
        }
      }
    }
    if (Math.abs(matrix[p]![q]!) < 1e-12) break;
    const pp = matrix[p]![p]!,
      qq = matrix[q]![q]!,
      pq = matrix[p]![q]!;
    const angle = 0.5 * Math.atan2(2 * pq, qq - pp);
    const c = Math.cos(angle),
      s = Math.sin(angle);
    for (let k = 0; k < size; k++) {
      if (k !== p && k !== q) {
        const kp = matrix[k]![p]!,
          kq = matrix[k]![q]!;
        matrix[k]![p] = matrix[p]![k] = c * kp - s * kq;
        matrix[k]![q] = matrix[q]![k] = s * kp + c * kq;
      }
      const vp = vectors[k]![p]!,
        vq = vectors[k]![q]!;
      vectors[k]![p] = c * vp - s * vq;
      vectors[k]![q] = s * vp + c * vq;
    }
    matrix[p]![p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    matrix[q]![q] = s * s * pp + 2 * s * c * pq + c * c * qq;
    matrix[p]![q] = matrix[q]![p] = 0;
  }
  const components = traits
    .map((_, j) => {
      const coefficients = vectors.map((row) => row[j]!);
      const largest = coefficients.reduce(
        (best, value, i) =>
          Math.abs(value) > Math.abs(coefficients[best]!) ? i : best,
        0,
      );
      const sign = coefficients[largest]! < 0 ? -1 : 1;
      return {
        variance: Math.max(0, matrix[j]![j]!),
        coefficients: coefficients.map((value) => value * sign),
      };
    })
    .sort((a, b) => b.variance - a.variance);
  const total = components.reduce(
    (sum, component) => sum + component.variance,
    0,
  );
  if (total < 1e-10) return null;
  return {
    sampleSize: n,
    excluded: input.length - n,
    constantTraits: traits.filter((_, j) => deviations[j]! <= 1e-10),
    means,
    deviations,
    components: components.map((component) => ({
      ...component,
      explained: component.variance / total,
    })),
    points: rows.map((row, i) => ({
      id: row.id,
      coordinates: components.map((component) =>
        component.coefficients.reduce(
          (sum, coefficient, j) => sum + coefficient * standardized[i]![j]!,
          0,
        ),
      ),
    })),
  };
}
