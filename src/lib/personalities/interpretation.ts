import { traits } from "./data";

const descriptions = [
  "open to new experiences",
  "organized",
  "outgoing",
  "cooperative",
  "reactive to stress",
];

export function axisDescription(
  coefficients: number[],
  variance: number,
  direction = 1,
) {
  const strongest = coefficients
    .map((coefficient, j) => ({
      j,
      correlation: coefficient * Math.sqrt(variance),
    }))
    .filter((c) => Math.abs(c.correlation) >= 0.4)
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
    .slice(0, 3);
  return strongest.length
    ? strongest
        .map(
          (c) =>
            `${c.correlation * direction > 0 ? "more" : "less"} ${descriptions[c.j]}`,
        )
        .join(", ")
    : "a mixture of small trait differences";
}

export function describeCluster(centroid: number[]) {
  const standout = centroid
    .map((z, j) => ({ z, j }))
    .filter((t) => Math.abs(t.z) >= 0.35)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return {
    label: standout.length
      ? standout
          .slice(0, 2)
          .map((t) => `${t.z > 0 ? "Higher" : "Lower"} ${traits[t.j]}`)
          .join(" · ")
      : "Near the group average",
    description: standout.length
      ? standout
          .slice(0, 3)
          .map((t) => `${t.z > 0 ? "more" : "less"} ${descriptions[t.j]}`)
          .join(", ") + " than this group's average"
      : "No trait average is more than 0.35 standard deviations from this group's average.",
  };
}
