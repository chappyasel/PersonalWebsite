// Homepage 3D scene prop inspector — renders and measures the BUILT GLBs in
// /public/models with no GPU, so a placement question can be settled before
// it reaches the scene. This repo has shipped three bugs that a render would
// have caught in seconds: the desk lamp's emissive disc sat 10 cm low and 32°
// off axis, the pothos floated because `center --pivot below` seated a
// trailing vine tip instead of the pot, and the Mac shipped facing backwards.
//
//   node scripts/stacks-render.mjs mac              # render + report
//   node scripts/stacks-render.mjs --all            # every prop in /models
//   node scripts/stacks-render.mjs mac --yaws 0,90,180,270 --pitch 0.12
//   node scripts/stacks-render.mjs pothos --report  # skip the PNG
//   node scripts/stacks-render.mjs lamp-floor --profile
//                                                   # + max-radius-per-y
//                                                   # bands (light rigs)
//
// PNGs land in /tmp/stacks-render/<name>.png, one strip per prop, one panel
// per yaw, with a red line drawn at local y = 0.
//
// ---------------------------------------------------------------------------
// CAMERA SIDE — read this before quoting a yaw at anyone.
// The camera sits at +Z looking toward −Z, the same side as the scene camera,
// so **--yaws here equals the scene's rotation-y**. A prop whose face shows at
// --yaws 0 needs rotation-y = 0.
// This was wrong once and cost a round trip. `project()` returns a depth `d`
// and the z-test keeps the SMALLER d, so nearer must be the smaller number.
// Left un-negated, d = z at yaw 0 — nearer becomes more-negative z, which
// parks the camera at −Z and silently reports every yaw half a turn out. Hence
// the negation in `project`. If you touch that line, re-check it against a
// prop with an obvious front (mac) before trusting any yaw this file prints.
//
// ---------------------------------------------------------------------------
// CONTACT PLANE — why this does not use a radius-from-axis probe.
// The scene's convention is that local y = 0 IS the shelf wood, and
// `--pivot below` only guarantees y = 0 is the LOWEST VERTEX, which is a
// different thing the moment anything overhangs. The obvious test — "is the
// lowest geometry close to the model's vertical axis?" — PASSES the broken
// pothos and has now caught two people independently, because the bbox centre
// of a lopsided plant is nowhere near the pot's axis.
// What actually works is a CONNECTED-ISLAND SPLIT: weld coincident positions
// (meshopt quantization splits solids otherwise), union-find the triangles,
// and you get the pot as one island and each trailing vine as its own. On top
// of that the contact plane is found by SUPPORT POLYGON — the lowest height
// whose horizontal slab is wide enough to actually rest on. Four splayed chair
// legs qualify; a single vine tip does not. Neither test needs an axis.
// pothos's island-exact pot base is **0.2182**. An earlier dense-ring estimate
// of 0.211 is what shipped; the difference is 0.0036 world at scale 0.5, so it
// is a correct-in-passing, not a commit of its own.
//
// A support does NOT have to enclose area, and this is the easy thing to
// break: the barbell rests on two plates and the headphones on two earcups,
// contacts whose hull is a LINE enclosing nothing. An area-only rule rejected
// both and wanted to lift the barbell 0.27 into the air. Hence the second
// test — a contact spanning a third of the silhouette is real support however
// thin it is. If you tighten either threshold to fix some other prop, re-run
// `--all` and check barbell, headphones and pothos together: the first two
// must read SITS ON 0 and pothos must still read OVERHANG.
//
// ---------------------------------------------------------------------------
// SCALE — the room has TWO legitimate conversions. Do not average them.
//   shelf props   ~2.00 world units per metre
//   furniture     ~0.96 world units per metre  (the bookcase itself: ground to
//                 top plank is 1.115 units)
// So the objects standing on the shelves are drawn at roughly twice the scale
// of the shelving holding them. That is a real, pre-existing property of the
// room and the owner's call, not a bug to reconcile.
//   scale = real_metres * unitsPerMetre / glbHeight
// The 2.00 is measured off the book primitives, which are the only props whose
// real-world size is unambiguous — packRow spines (w 0.055…0.130, h 0.4…0.6,
// depth 0.3), BookPile's book (0.46 x 0.06 x 0.32) and BookRowMesh's cover
// (0.36 x 0.52 x 0.048). Against a 0.03 x 0.235 x 0.16 m hardcover that is
// eight independent axes across three primitives, and they cluster hard at 2.
// Two ways this has already been got wrong, both worth avoiding:
//   - Deriving it from PROP scales instead. Sampling the globe (1.20), desk
//     lamp (1.30) and sansevieria (0.90) yields ~1.2, but all three are
//     undersized props — averaging outliers just reproduces the outlier.
//   - Reading a book dimension out of prose rather than the source. "0.22
//     tall" is the hardcover's height in METRES; it is not any world-unit
//     dimension of any book in this codebase, and mistaking it for one halves
//     the answer.
//
// FACING — two signals, because neither works alone: an enclosed form backs
// its mass onto the rear (read the crown), an appliance carries its detail on
// the face (read triangle density). Validated against the two props whose
// answer was known independently — the chair (crown 0.87) and the mac (detail
// 0.53) both resolve to rotation-y = 0. KNOWN LIMIT: foliage has no front, and
// on a plant the crown is just whichever leaf grew tallest. Where the two
// signals split this says so, but a plant CAN still produce a confident-
// looking answer. Ignore facing on foliage; any yaw is fine there.
//
// LIGHT RIGS — `--profile` exists because emissive discs and point lights have
// to be placed inside a shade, and the shade is a material island, not a node.
// Per material this prints the y range, the radius at the bottom (the mouth
// the light spills from) and at the top opening. lamp-floor's `lamp` material
// reads y 0.6815…0.8600, mouth 0.0878, top opening 0.0623 — those three
// numbers are what a glow needs and none of them are in the bbox.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// three-stdlib's GLTFLoader expects a DOM. None of these stubs are exercised
// by the meshopt path; they only stop the module from throwing on import.
globalThis.Image = class {
  constructor() {
    setTimeout(() => this.onload && this.onload(), 0);
  }
  set src(v) {}
  addEventListener(t, f) {
    if (t === "load") setTimeout(f, 0);
  }
  removeEventListener() {}
};
globalThis.document = {
  createElementNS: () => ({ getContext: () => ({}), style: {} }),
  createElement: () => ({ getContext: () => ({}), style: {} }),
};
globalThis.self = globalThis;
if (!globalThis.URL.createObjectURL)
  globalThis.URL.createObjectURL = () => "blob:stub";

const MODELS = path.join(process.cwd(), "public", "models");
const OUT = path.join(os.tmpdir(), "stacks-render");
const S = 420; // pixels per panel
const MARGIN = 0.14; // empty fraction around the model

const [{ GLTFLoader, MeshoptDecoder }, THREE] = await Promise.all([
  import("three-stdlib"),
  import("three"),
]);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(
  typeof MeshoptDecoder === "function" ? MeshoptDecoder() : MeshoptDecoder,
);

/** Every triangle in world space, tagged with its material. */
function readTriangles(scene) {
  const tris = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const mat = [o.material].flat()[0];
    const name = mat?.name || "(unnamed)";
    const color = mat?.color
      ? [mat.color.r, mat.color.g, mat.color.b]
      : [0.8, 0.8, 0.8];
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      tris.push({
        p: [
          [a.x, a.y, a.z],
          [b.x, b.y, b.z],
          [c.x, c.y, c.z],
        ],
        mat: name,
        color,
      });
    }
  });
  return tris;
}

const bounds = (pts) => {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
  return { min, max };
};

/** 2D convex hull (monotone chain) over [x, z] pairs. */
function hull(points) {
  if (points.length < 3) return points.slice();
  const p = [...points].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const cross = (o, u, v) =>
    (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  const half = (src) => {
    const out = [];
    for (const q of src) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2], out[out.length - 1], q) <= 0
      )
        out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

/** Widest distance across a point set, via its hull. */
function spread(points) {
  const h = hull(points);
  let best = 0;
  for (let i = 0; i < h.length; i++)
    for (let j = i + 1; j < h.length; j++)
      best = Math.max(best, Math.hypot(h[i][0] - h[j][0], h[i][1] - h[j][1]));
  return best;
}

/** Area of the hull — the support polygon the prop would actually balance on.
 * Area rather than width is deliberate: by diameter the pothos's trailing
 * vine (23% of the footprint) and the monstera's real pot (32%) are nearly
 * indistinguishable, and a threshold between them is a coin flip. Squaring
 * the measure pulls them an order of magnitude apart — a strand sweeping
 * sideways encloses almost nothing, a pot ring encloses a disc. */
function hullArea(points) {
  const h = hull(points);
  if (h.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < h.length; i++) {
    const [x1, z1] = h[i];
    const [x2, z2] = h[(i + 1) % h.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) / 2;
}

/**
 * Connected islands. Positions are welded onto a grid first — meshopt
 * quantization leaves a solid's shared corners at very slightly different
 * coordinates, and unwelded connectivity shatters one pot into thirty pieces.
 */
function islands(tris, scale) {
  const eps = Math.max(scale * 1e-3, 1e-6);
  const ids = new Map();
  const key = (p) =>
    `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)},${Math.round(p[2] / eps)}`;
  const vid = (p) => {
    const k = key(p);
    let v = ids.get(k);
    if (v === undefined) {
      v = ids.size;
      ids.set(k, v);
    }
    return v;
  };
  const parent = [];
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (x, y) => {
    const a = find(x),
      b = find(y);
    if (a !== b) parent[a] = b;
  };

  const triVerts = tris.map((t) => t.p.map(vid));
  for (let i = 0; i < ids.size; i++) parent[i] = parent[i] ?? i;
  for (const v of triVerts) for (const x of v) parent[x] = parent[x] ?? x;
  for (const [v0, v1, v2] of triVerts) {
    union(v0, v1);
    union(v1, v2);
  }

  const groups = new Map();
  tris.forEach((t, i) => {
    const root = find(triVerts[i][0]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(t);
  });
  return [...groups.values()]
    .map((group) => {
      const pts = group.flatMap((t) => t.p);
      const { min, max } = bounds(pts);
      return {
        tris: group.length,
        min,
        max,
        pts,
        footprint: spread(pts.map((p) => [p[0], p[2]])),
        mats: [...new Set(group.map((t) => t.mat))],
      };
    })
    .sort((a, b) => a.min[1] - b.min[1]);
}

/**
 * The lowest height the prop could actually rest on. Walks slabs upward and
 * takes the first whose horizontal spread is a real footprint rather than a
 * dangling tip. Axis-free on purpose — see the header note.
 */
function contactPlane(isles, min, max) {
  const height = max[1] - min[1] || 1;
  const flatAll = isles.flatMap((i) => i.pts).map((p) => [p[0], p[2]]);
  const full = hullArea(flatAll) || 1;
  const fullWidth = spread(flatAll) || 1;
  const slab = height * 0.015;
  const tol = height * 0.01;

  // Candidate planes are the heights at which islands BOTTOM OUT, not evenly
  // spaced slabs. A plain slab sweep mixes islands and lets three unrelated
  // leaves in one band fake a footprint — that is what put the pothos's
  // contact at 0.045 instead of its pot at 0.2182. Islands that bottom out
  // together are then hulled TOGETHER, which is what the chair needs: each
  // of its four splayed legs is a separate island whose single foot encloses
  // nothing, but the four feet share a plane and span the whole seat.
  const planes = [...new Set(isles.map((i) => i.min[1]))].sort((a, b) => a - b);
  for (const plane of planes) {
    const resting = isles.filter((i) => Math.abs(i.min[1] - plane) <= tol);
    const feet = resting
      .flatMap((i) => i.pts)
      .filter((p) => p[1] <= plane + slab);
    if (feet.length < 3) continue;
    const flat = feet.map((p) => [p[0], p[2]]);
    const area = hullArea(flat);
    const width = spread(flat);
    // Two tests, because a support does not have to enclose area. Area is
    // calibrated on props whose answer we knew: the pothos's lone vine tip
    // encloses 0.1% of the footprint (broken) against the monstera's pot at
    // 7.7%, the cactus's bowl at 39% and the chair's four feet at 75% (all
    // correct), so 3% sits in the empty gap. But a barbell rests on two
    // plates and headphones on two earcups — a DEGENERATE contact whose hull
    // is a line enclosing nothing, which the area test alone rejected, and it
    // wanted to lift the barbell 0.27 into the air. A contact spanning a
    // third of the silhouette is real support however thin it is.
    if (area >= full * 0.03 || width >= fullWidth * 0.3) {
      return { y: plane - min[1], area, full, width, islands: resting.length };
    }
  }
  return { y: 0, area: 0, full, width: 0, islands: 0 };
}

/** Per-material y range, radius envelope and centroid — the light-rig data. */
function materialStats(tris, axis) {
  const out = new Map();
  for (const t of tris) {
    let m = out.get(t.mat);
    if (!m) {
      m = { tris: 0, pts: [] };
      out.set(t.mat, m);
    }
    m.tris++;
    m.pts.push(...t.p);
  }
  for (const [, m] of out) {
    const { min, max } = bounds(m.pts);
    m.min = min;
    m.max = max;
    const h = max[1] - min[1] || 1;
    const rad = (p) => Math.hypot(p[0] - axis[0], p[2] - axis[1]);
    const inBand = (lo, hi) =>
      m.pts.filter((p) => p[1] >= min[1] + h * lo && p[1] <= min[1] + h * hi);
    const rOf = (set) => (set.length ? Math.max(...set.map(rad)) : 0);
    m.rBottom = rOf(inBand(0, 0.1));
    m.rTop = rOf(inBand(0.9, 1));
    m.rMax = rOf(m.pts);
    m.centroid = [0, 1, 2].map(
      (k) => m.pts.reduce((s, p) => s + p[k], 0) / m.pts.length,
    );
  }
  return out;
}

/**
 * Which way the prop faces. Two independent signals, because one alone gets
 * it wrong: an enclosed form (chair) backs its mass onto the rear, while an
 * appliance (mac) carries its detail on the front. Both are reported; they
 * agreed on every prop in the v4 set.
 */
function facing(tris, min, max) {
  const mid = (min[2] + max[2]) / 2;
  const halfDepth = (max[2] - min[2]) / 2 || 1;
  const top = min[1] + (max[1] - min[1]) * 0.88;

  // Signal 1 — CROWN. On an enclosed form the only structure in the top
  // eighth is the backrest, so the seat faces the other way. Deliberately not
  // the whole-model centroid: a chair's seat and front rail carry enough area
  // to cancel its own back (bulk z came out +0.016 on a chair whose backrest
  // is demonstrably at −0.412), which is how that signal quietly lies.
  const crown = tris.flatMap((t) => t.p).filter((p) => p[1] >= top);
  const crownZ = crown.length
    ? crown.reduce((s, p) => s + p[2], 0) / crown.length - mid
    : 0;

  // Signal 2 — DETAIL. An appliance is a plain box behind and a bezel, slot
  // and screen in front, so triangles pile up on the face.
  let frontTris = 0,
    backTris = 0;
  for (const t of tris) {
    if ((t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3 > mid) frontTris++;
    else backTris++;
  }

  const crownStrength = Math.abs(crownZ) / halfDepth;
  const detailStrength =
    Math.abs(frontTris - backTris) / (frontTris + backTris || 1);
  const useCrown = crownStrength >= detailStrength;
  const strength = useCrown ? crownStrength : detailStrength;
  // Crown sits at the BACK, so the face is opposite it. Detail sits ON the
  // face. Same answer, read from opposite ends of the model.
  const crownFront = crownZ < 0 ? "+Z" : "-Z";
  const detailFront = frontTris >= backTris ? "+Z" : "-Z";
  const front = useCrown ? crownFront : detailFront;
  // Contradiction is itself the signal — but only between two signals that
  // are both actually saying something. A prop with a designed front reads
  // the same from both ends; foliage splits, because its "crown" is just
  // whichever leaf grew tallest. The noise floor matters: the mac's crown is
  // +0.003 on a symmetric box (strength 0.11, meaningless) and without this
  // gate that noise vetoes a detail signal of 0.53 that is plainly right.
  const FLOOR = 0.15;
  const split =
    crownFront !== detailFront &&
    crownStrength >= FLOOR &&
    detailStrength >= FLOOR;
  return {
    crownZ,
    crownStrength,
    detailStrength,
    frontTris,
    backTris,
    via: useCrown ? "crown" : "detail",
    front,
    strength,
    split,
    clear: strength >= 0.15 && !split,
  };
}

function renderView(tris, min, max, yaw, pitch) {
  const buf = Buffer.alloc(S * S * 3, 255);
  const zbuf = new Float32Array(S * S).fill(Infinity);
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  // world -> view: yaw about Y, then pitch about X. `d` is NEGATED so that
  // nearer-to-a-+Z-camera is the smaller number, which is what the z-test
  // below keeps. See the camera-side note in the header.
  const project = (p) => {
    const x = p[0] * cy - p[2] * sy;
    const z = p[0] * sy + p[2] * cy;
    const y = p[1] * cp - z * sp;
    return [x, y, -(p[1] * sp + z * cp)];
  };

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let c = 0; c < 8; c++) {
    const p = project([
      c & 1 ? max[0] : min[0],
      c & 2 ? max[1] : min[1],
      c & 4 ? max[2] : min[2],
    ]);
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const span = Math.max(maxX - minX, maxY - minY) / (1 - 2 * MARGIN);
  const ox = (minX + maxX) / 2,
    oy = (minY + maxY) / 2;
  const toPx = (p) => [
    ((p[0] - ox) / span) * S + S / 2,
    S / 2 - ((p[1] - oy) / span) * S,
  ];
  const L = [0.45, 0.75, 0.5];
  const Ln = Math.hypot(...L);

  for (const t of tris) {
    const v = t.p.map(project);
    const s = v.map(toPx);
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const nl = Math.hypot(...n) || 1;
    const lam =
      0.32 +
      0.68 * Math.abs((n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nl * Ln));
    // Textureless props ship white; a mid grey lets the shading read.
    const base =
      t.color[0] > 0.97 && t.color[1] > 0.97 && t.color[2] > 0.97
        ? [0.72, 0.7, 0.66]
        : t.color;
    const col = base.map((c) =>
      Math.max(0, Math.min(255, Math.round(c * lam * 255))),
    );

    const bx0 = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0])));
    const bx1 = Math.min(S - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0])));
    const by0 = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1])));
    const by1 = Math.min(S - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1])));
    const areaS =
      (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) -
      (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
    if (Math.abs(areaS) < 1e-9) continue;
    for (let py = by0; py <= by1; py++) {
      for (let px = bx0; px <= bx1; px++) {
        const cx = px + 0.5,
          cyy = py + 0.5;
        const w0 =
          ((s[1][0] - cx) * (s[2][1] - cyy) -
            (s[2][0] - cx) * (s[1][1] - cyy)) /
          areaS;
        const w1 =
          ((s[2][0] - cx) * (s[0][1] - cyy) -
            (s[0][0] - cx) * (s[2][1] - cyy)) /
          areaS;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const d = w0 * v[0][2] + w1 * v[1][2] + w2 * v[2][2];
        const i = py * S + px;
        if (d >= zbuf[i]) continue;
        zbuf[i] = d;
        buf[i * 3] = col[0];
        buf[i * 3 + 1] = col[1];
        buf[i * 3 + 2] = col[2];
      }
    }
  }

  // Reference the ground line at the model's mid-depth, not the origin: under
  // a non-zero pitch the y=0 plane projects to a different screen height for
  // every z, and anchoring it at z=0 draws the line through the middle of a
  // prop whose mass sits further back.
  const gy = Math.round(toPx(project([0, 0, (min[2] + max[2]) / 2]))[1]);
  if (gy >= 0 && gy < S) {
    for (let px = 0; px < S; px++) {
      const i = gy * S + px;
      buf[i * 3] = 220;
      buf[i * 3 + 1] = 40;
      buf[i * 3 + 2] = 40;
    }
  }
  return buf;
}

const f4 = (n) => n.toFixed(4).padStart(9);

async function inspect(name, opts) {
  const file = path.join(MODELS, `${name}.glb`);
  const buf = fs.readFileSync(file);
  const gltf = await new Promise((res, rej) =>
    loader.parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      "",
      res,
      rej,
    ),
  );
  gltf.scene.updateMatrixWorld(true);

  const tris = readTriangles(gltf.scene);
  if (!tris.length) throw new Error(`${name}: no geometry`);
  const { min, max } = bounds(tris.flatMap((t) => t.p));
  const size = [0, 1, 2].map((k) => max[k] - min[k]);
  const scale = Math.max(...size);
  const axis = [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2];

  console.log(
    `\n${name}  ${(buf.length / 1024).toFixed(1)} KB  ${tris.length} tris`,
  );
  console.log(
    `  bbox     min [${f4(min[0])},${f4(min[1])},${f4(min[2])}]  max [${f4(max[0])},${f4(max[1])},${f4(max[2])}]`,
  );
  console.log(`  size     [${f4(size[0])},${f4(size[1])},${f4(size[2])}]`);

  const isles = islands(tris, scale);
  const contact = contactPlane(isles, min, max);
  const rests = contact.y <= size[1] * 0.005;
  console.log(
    `  contact  y ${contact.y.toFixed(4)}  (${contact.islands} island(s) rest here; support polygon ` +
      `${contact.width.toFixed(4)} wide, ${((contact.area / contact.full) * 100).toFixed(1)}% of footprint area)  ` +
      (rests
        ? "SITS ON 0"
        : `OVERHANG — placement must add y += ${contact.y.toFixed(4)} * scale`),
  );

  console.log(`  islands  ${isles.length}`);
  for (const isle of isles.slice(0, opts.allIslands ? 999 : 6)) {
    const below = isle.min[1] < contact.y - size[1] * 0.005;
    console.log(
      `    ${String(isle.tris).padStart(4)} tris  y ${isle.min[1].toFixed(4)}..${isle.max[1].toFixed(4)}` +
        `  footprint ${isle.footprint.toFixed(4)}  ${isle.mats.join(",")}` +
        (below ? "   <-- HANGS BELOW the contact plane" : ""),
    );
  }
  if (isles.length > 6 && !opts.allIslands)
    console.log(`    … ${isles.length - 6} more (--islands for all)`);

  console.log("  materials");
  for (const [mat, m] of materialStats(tris, axis)) {
    console.log(
      `    ${mat.padEnd(30)} ${String(m.tris).padStart(4)} tris  y ${m.min[1].toFixed(4)}..${m.max[1].toFixed(4)}` +
        `  mouth r ${m.rBottom.toFixed(4)}  top r ${m.rTop.toFixed(4)}  max r ${m.rMax.toFixed(4)}`,
    );
    if (opts.profile) {
      const h = m.max[1] - m.min[1] || 1;
      const bands = [];
      for (let i = 0; i < 8; i++) {
        const lo = m.min[1] + (i / 8) * h;
        // Inclusive on the last band: a low-poly shade carries vertices only
        // at its two rims, and an exclusive upper bound drops the top ring
        // entirely — which reads as "the shade has no opening".
        const hi = lo + h / 8;
        const set = m.pts.filter(
          (p) => p[1] >= lo && (i === 7 ? p[1] <= hi : p[1] < hi),
        );
        bands.push(
          `${lo.toFixed(3)}:${(set.length ? Math.max(...set.map((p) => Math.hypot(p[0] - axis[0], p[2] - axis[1]))) : 0).toFixed(4)}`,
        );
      }
      console.log(`      r(y) ${bands.join("  ")}`);
    }
  }

  const face = facing(tris, min, max);
  console.log(
    `  facing   crown z ${face.crownZ >= 0 ? "+" : ""}${face.crownZ.toFixed(4)} (strength ${face.crownStrength.toFixed(2)});  ` +
      `detail ${face.frontTris}/${face.backTris} tris (strength ${face.detailStrength.toFixed(2)})`,
  );
  console.log(
    face.clear
      ? `           => front is ${face.front} via ${face.via}  =>  rotation-y = ${face.front === "+Z" ? "0" : "PI"}`
      : face.split
        ? "           => no clear front — the two signals split, which is what foliage does. Any yaw."
        : "           => no clear front — symmetric. Any yaw.",
  );

  if (opts.render) {
    const { default: sharp } = await import("sharp");
    const views = opts.yaws.map((d) =>
      renderView(tris, min, max, (d * Math.PI) / 180, opts.pitch),
    );
    const strip = Buffer.alloc(S * views.length * S * 3, 255);
    views.forEach((view, vi) => {
      for (let y = 0; y < S; y++)
        view.copy(
          strip,
          (y * S * views.length + vi * S) * 3,
          y * S * 3,
          (y + 1) * S * 3,
        );
    });
    fs.mkdirSync(OUT, { recursive: true });
    const png = path.join(OUT, `${name}.png`);
    await sharp(strip, {
      raw: { width: S * views.length, height: S, channels: 3 },
    })
      .png()
      .toFile(png);
    console.log(`  render   ${png}  (yaws ${opts.yaws.join(",")})`);
  }
}

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i === -1 ? d : argv[i + 1];
};
const opts = {
  yaws: String(flag("--yaws", "0,45,90")).split(",").map(Number),
  pitch: Number(flag("--pitch", 0)),
  render: !argv.includes("--report"),
  profile: argv.includes("--profile"),
  allIslands: argv.includes("--islands"),
};
let names = argv.filter(
  (a) =>
    !a.startsWith("--") &&
    argv[argv.indexOf(a) - 1] !== "--yaws" &&
    argv[argv.indexOf(a) - 1] !== "--pitch",
);
if (argv.includes("--all") || !names.length) {
  names = fs
    .readdirSync(MODELS)
    .filter((f) => f.endsWith(".glb"))
    .map((f) => f.replace(/\.glb$/, ""))
    .sort();
}
for (const n of names) await inspect(n, opts);
