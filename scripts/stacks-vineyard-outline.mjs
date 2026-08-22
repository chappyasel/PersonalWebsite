// Homepage scene: the Martha's Vineyard cutout's outline, derived once from
// the owner-supplied island silhouette and written as a plain point list the
// scene can extrude without shipping an SVG parser.
//
//   node scripts/stacks-vineyard-outline.mjs            # regenerate
//   node scripts/stacks-vineyard-outline.mjs --tolerance 3
//
// Source: docs/research/assets/2026-08-22-vineyard-cutout/marthas-vineyard.svg
// (one filled path, 964×592 viewBox, north up, Aquinnah at the left edge).
// The path is one outer contour plus twelve inland ponds as holes and five
// stray sub-pixel specks. Only the outer contour is kept: at shelf scale the
// piece is a few hundred pixels wide at most, a pond hole would be a speck
// the width of a scratch, and a real wooden cutout of the island is sold as
// a solid silhouette anyway. Ramer–Douglas–Peucker thins the flattened
// Béziers (1,725 points) to a little over a hundred, which still holds every
// harbour and headland the eye can name and keeps the extrusion near 500
// triangles with its bevel.
//
// Output: src/app/components/stacks/scene/units/vineyardOutline.ts —
// points normalised to a 1-unit width, centred on the bounding box, y up,
// counter-clockwise so THREE.Shape triangulates the front cap facing +Z.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE = path.join(
  ROOT,
  "docs/research/assets/2026-08-22-vineyard-cutout/marthas-vineyard.svg",
);
const OUT = path.join(
  ROOT,
  "src/app/components/stacks/scene/units/vineyardOutline.ts",
);
const args = process.argv.slice(2);
const tolArg = args.indexOf("--tolerance");
const TOLERANCE = tolArg === -1 ? 2.4 : Number(args[tolArg + 1]);

function tokenize(d) {
  const re = /([MmLlHhVvCcSsZz])|(-?\d*\.?\d+(?:e-?\d+)?)/g;
  const out = [];
  let m;
  while ((m = re.exec(d))) out.push(m[1] ?? Number(m[2]));
  return out;
}

/** Flatten one SVG path `d` into closed polylines (absolute coordinates). */
function flatten(d, segments = 10) {
  const t = tokenize(d);
  const polys = [];
  let poly = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = null;
  let px = null;
  let py = null;
  let i = 0;
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    for (let k = 1; k <= segments; k++) {
      const s = k / segments;
      const u = 1 - s;
      poly.push([
        u * u * u * x +
          3 * u * u * s * x1 +
          3 * u * s * s * x2 +
          s * s * s * x3,
        u * u * u * y +
          3 * u * u * s * y1 +
          3 * u * s * s * y2 +
          s * s * s * y3,
      ]);
    }
    px = x2;
    py = y2;
    x = x3;
    y = y3;
  };
  const close = () => {
    if (poly) polys.push(poly);
    poly = null;
  };
  while (i < t.length) {
    if (typeof t[i] === "string") {
      cmd = t[i++];
      if (cmd === "Z" || cmd === "z") {
        close();
        x = sx;
        y = sy;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const n = () => t[i++];
    switch (cmd.toUpperCase()) {
      case "M": {
        const nx = n();
        const ny = n();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        sx = x;
        sy = y;
        close();
        poly = [[x, y]];
        cmd = rel ? "l" : "L";
        px = py = null;
        break;
      }
      case "L": {
        const nx = n();
        const ny = n();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        poly.push([x, y]);
        px = py = null;
        break;
      }
      case "H": {
        const nx = n();
        x = rel ? x + nx : nx;
        poly.push([x, y]);
        px = py = null;
        break;
      }
      case "V": {
        const ny = n();
        y = rel ? y + ny : ny;
        poly.push([x, y]);
        px = py = null;
        break;
      }
      case "C": {
        let x1 = n(),
          y1 = n(),
          x2 = n(),
          y2 = n(),
          x3 = n(),
          y3 = n();
        if (rel) {
          x1 += x;
          y1 += y;
          x2 += x;
          y2 += y;
          x3 += x;
          y3 += y;
        }
        cubic(x1, y1, x2, y2, x3, y3);
        break;
      }
      case "S": {
        let x2 = n(),
          y2 = n(),
          x3 = n(),
          y3 = n();
        if (rel) {
          x2 += x;
          y2 += y;
          x3 += x;
          y3 += y;
        }
        const x1 = px == null ? x : 2 * x - px;
        const y1 = py == null ? y : 2 * y - py;
        cubic(x1, y1, x2, y2, x3, y3);
        break;
      }
      default:
        throw new Error(`unsupported path command ${cmd}`);
    }
  }
  close();
  return polys;
}

function signedArea(poly) {
  let area = 0;
  for (let k = 0; k < poly.length; k++) {
    const [x1, y1] = poly[k];
    const [x2, y2] = poly[(k + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/** Ramer–Douglas–Peucker on a closed ring (split at the two farthest points
 * so the closing edge is simplified like any other). */
function simplify(points, tolerance) {
  const dist = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    const cx = a[0] + Math.max(0, Math.min(1, t)) * dx;
    const cy = a[1] + Math.max(0, Math.min(1, t)) * dy;
    return Math.hypot(p[0] - cx, p[1] - cy);
  };
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    let index = 0;
    let max = 0;
    for (let k = 1; k < pts.length - 1; k++) {
      const d = dist(pts[k], pts[0], pts[pts.length - 1]);
      if (d > max) {
        max = d;
        index = k;
      }
    }
    if (max <= tolerance) return [pts[0], pts[pts.length - 1]];
    const left = rdp(pts.slice(0, index + 1));
    const right = rdp(pts.slice(index));
    return left.slice(0, -1).concat(right);
  };
  // Split at the leftmost and rightmost points (the island's two far ends).
  let lo = 0;
  let hi = 0;
  points.forEach((p, k) => {
    if (p[0] < points[lo][0]) lo = k;
    if (p[0] > points[hi][0]) hi = k;
  });
  const a = lo < hi ? points.slice(lo, hi + 1) : points.slice(hi, lo + 1);
  const b =
    lo < hi
      ? points.slice(hi).concat(points.slice(0, lo + 1))
      : points.slice(lo).concat(points.slice(0, hi + 1));
  return rdp(a).slice(0, -1).concat(rdp(b).slice(0, -1));
}

const svg = fs.readFileSync(SOURCE, "utf8");
const ds = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
if (!ds.length) throw new Error("no <path d=…> in the source SVG");
const rings = ds.flatMap((d) => flatten(d));
// The island is the ring with the largest area; holes and specks are the rest.
const outer = rings.reduce((best, ring) =>
  Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best,
);
const thinned = simplify(outer, TOLERANCE);
let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
for (const [x, y] of thinned) {
  minX = Math.min(minX, x);
  maxX = Math.max(maxX, x);
  minY = Math.min(minY, y);
  maxY = Math.max(maxY, y);
}
const width = maxX - minX;
const height = maxY - minY;
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
// SVG y grows downward; the scene's y grows upward.
let normalized = thinned.map(([x, y]) => [(x - cx) / width, -(y - cy) / width]);
if (signedArea(normalized) < 0) normalized = normalized.reverse();
const aspect = height / width;
const fmt = (v) => (Math.round(v * 10000) / 10000).toString();
const body = normalized.map(([x, y]) => `  [${fmt(x)}, ${fmt(y)}],`).join("\n");
fs.writeFileSync(
  OUT,
  `// GENERATED by scripts/stacks-vineyard-outline.mjs — do not edit by hand.
// Martha's Vineyard, outer coastline only, from the owner-supplied silhouette
// (docs/research/assets/2026-08-22-vineyard-cutout/marthas-vineyard.svg).
// ${normalized.length} points from ${outer.length} flattened (tolerance ${TOLERANCE}
// source units of ${Math.round(width)}), normalised to a 1-unit width, centred,
// y up, counter-clockwise. Aquinnah and Gay Head Light are the west tip at
// x = -0.5; Chappaquiddick is the east end.

/** Height over width of the outline's bounding box. */
export const VINEYARD_ASPECT = ${fmt(aspect)};

export const VINEYARD_OUTLINE: ReadonlyArray<readonly [number, number]> = [
${body}
];
`,
);
console.log(
  `vineyardOutline.ts: ${normalized.length} points (from ${outer.length}), aspect ${fmt(aspect)}, ${rings.length - 1} holes/specks dropped`,
);
