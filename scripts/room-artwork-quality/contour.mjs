/** Contours in the approved raster coordinates. No resampling or blur. */
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pointSegmentDistance = (p, a, b) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
};
function simplify(points, tolerance) {
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop();
    let greatest = tolerance,
      split = -1;
    for (let i = first + 1; i < last; i++) {
      const d = pointSegmentDistance(points[i], points[first], points[last]);
      if (d > greatest) {
        greatest = d;
        split = i;
      }
    }
    if (split >= 0) {
      keep.add(split);
      pending.push([first, split], [split, last]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}
function simplifyClosed(points, tolerance) {
  const farthest = (from) =>
    points.reduce(
      (best, p, i) =>
        distance(p, from) > distance(points[best], from) ? i : best,
      0,
    );
  const a = farthest(points[0]),
    b = farthest(points[a]);
  const rotated = [...points.slice(a), ...points.slice(0, a)];
  const split = (b - a + points.length) % points.length;
  return [
    ...simplify(rotated.slice(0, split + 1), tolerance).slice(0, -1),
    ...simplify([...rotated.slice(split), rotated[0]], tolerance).slice(0, -1),
  ];
}
function turn(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1]],
    v = [c[0] - b[0], c[1] - b[1]];
  return Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        (u[0] * v[0] + u[1] * v[1]) / (distance(a, b) * distance(b, c) || 1),
      ),
    ),
  );
}
const cubic = (a, b, c, d, t) => {
  const u = 1 - t;
  return [0, 1].map(
    (axis) =>
      u ** 3 * a[axis] +
      3 * u ** 2 * t * b[axis] +
      3 * u * t ** 2 * c[axis] +
      t ** 3 * d[axis],
  );
};
const fmt = (p) => p.map((n) => Number(n.toFixed(4))).join(" ");
function fittedPath(raw, tolerance) {
  const points = simplifyClosed(raw, tolerance);
  if (points.length < 3) return "";
  // Sharp manufactured corners remain vertices. Long straight edges are never
  // converted to curves simply because a neighboring contour is rounded.
  const corner = points.map(
    (p, i) =>
      turn(
        points[(i + points.length - 1) % points.length],
        p,
        points[(i + 1) % points.length],
      ) >=
      Math.PI / 4,
  );
  let result = `M${fmt(points[0])}`;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const before = points[(i + points.length - 1) % points.length],
      after = points[(i + 2) % points.length];
    const length = distance(a, b);
    let curved = !corner[i] && !corner[(i + 1) % points.length];
    // Scale tangent lengths to this span, avoiding overshoot beside short spans.
    const handle = (origin, start, end, sign) => {
      const factor = (sign * length) / (3 * (distance(start, end) || 1));
      return [
        origin[0] + (end[0] - start[0]) * factor,
        origin[1] + (end[1] - start[1]) * factor,
      ];
    };
    const c1 = handle(a, before, b, 1),
      c2 = handle(b, a, after, -1);
    // Only fit if the cubic stays within the declared raw-contour error. Check
    // in both directions to reject shortcuts across narrow notches or holes.
    if (curved) {
      const samples = Array.from(
        { length: Math.max(12, Math.ceil(length / 0.04)) + 1 },
        (_, j) => j,
      );
      const count = samples.length - 1;
      const curve = samples.map((_, j) => cubic(a, c1, c2, b, j / count));
      const near = raw.filter(
        (p) =>
          pointSegmentDistance(p, a, b) <= tolerance * 2 &&
          (p[0] - a[0]) * (p[0] - b[0]) + (p[1] - a[1]) * (p[1] - b[1]) <=
            tolerance * tolerance,
      );
      const minimum = [0, 1].map(
        (axis) => Math.min(a[axis], b[axis], c1[axis], c2[axis]) - tolerance,
      );
      const maximum = [0, 1].map(
        (axis) => Math.max(a[axis], b[axis], c1[axis], c2[axis]) + tolerance,
      );
      const segments = [];
      for (let k = 0; k < raw.length; k++) {
        const p = raw[k],
          q = raw[(k + 1) % raw.length];
        if (
          [0, 1].every(
            (axis) =>
              Math.max(p[axis], q[axis]) >= minimum[axis] &&
              Math.min(p[axis], q[axis]) <= maximum[axis],
          )
        )
          segments.push([p, q]);
      }
      curved =
        curve.every((p) =>
          segments.some(
            ([start, end]) => pointSegmentDistance(p, start, end) <= tolerance,
          ),
        ) &&
        near.every((p) =>
          curve.some(
            (q, k) =>
              k > 0 && pointSegmentDistance(p, curve[k - 1], q) <= tolerance,
          ),
        );
      // Collinear handles produce no visible benefit and inflate the SVG.
      curved &&=
        Math.max(
          pointSegmentDistance(c1, a, b),
          pointSegmentDistance(c2, a, b),
        ) > 0.005;
    }
    result += curved ? `C${fmt(c1)} ${fmt(c2)} ${fmt(b)}` : `L${fmt(b)}`;
  }
  return result + "Z";
}
/**
 * @param {{alpha:Uint8Array|Uint8ClampedArray,width:number,height:number,scale?:number,offset?:number[],tolerance?:number,threshold?:number}} input
 * @returns {string} Use fill-rule="evenodd". Offsets are original-raster pixels.
 */
export function traceContour({
  alpha,
  width,
  height,
  scale = 1,
  offset = [0, 0],
  tolerance = 0.25,
  threshold = 128,
}) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    alpha.length !== width * height ||
    !(scale > 0) ||
    !(tolerance > 0) ||
    offset.length !== 2 ||
    !offset.every(Number.isFinite)
  )
    throw new Error("Invalid contour dimensions, scale, offset or tolerance");
  let maximum = 0;
  for (const value of alpha) maximum = Math.max(maximum, value);
  const cutoff = maximum <= 1 ? 1 : threshold;
  const filled = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    alpha[y * width + x] >= cutoff;
  const edges = [],
    starts = new Map();
  const add = (x, y, nx, ny, direction) => {
    const key = y * (width + 1) + x;
    const edge = { x, y, nx, ny, direction, used: false };
    edges.push(edge);
    if (!starts.has(key)) starts.set(key, []);
    starts.get(key).push(edge);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (filled(x, y)) {
        if (!filled(x, y - 1)) add(x, y, x + 1, y, 0);
        if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1, 1);
        if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1, 2);
        if (!filled(x - 1, y)) add(x, y + 1, x, y, 3);
      }
  const result = [];
  for (const first of edges) {
    if (first.used) continue;
    const points = [];
    let edge = first;
    while (edge && !edge.used) {
      edge.used = true;
      points.push([edge.x / scale + offset[0], edge.y / scale + offset[1]]);
      if (edge.nx === first.x && edge.ny === first.y) break;
      const candidates = (
        starts.get(edge.ny * (width + 1) + edge.nx) ?? []
      ).filter((item) => !item.used);
      // At diagonally touching pixels, turn right to retain separate components.
      const priority = [1, 0, 3, 2];
      const direction = edge.direction;
      edge = candidates.sort(
        (a, b) =>
          priority.indexOf((a.direction - direction + 4) % 4) -
          priority.indexOf((b.direction - direction + 4) % 4),
      )[0];
    }
    if (!edge) throw new Error("Open contour in closed raster mask");
    // Do not simplify away a one-pixel component or a thin hole.
    result.push(
      fittedPath(points, Math.min(tolerance, points.length / scale / 16)),
    );
  }
  return result.join("");
}
export const trace = traceContour;
