// Generate inline, dependency-free front silhouettes for the About boot SVG.
// The source GLBs are loaded offline, turned to their exact UnitAbout yaw,
// projected orthographically, raster-unioned, boundary-traced, and simplified.
// Run from the repository root:
//   node scripts/generate-about-boot-silhouettes.mjs
import {
  tjMedallionFrontElevation,
  tjMedallionSolidGroup,
  tjMedallionSpecSignature,
} from "../src/app/components/stacks/scene/tjMedallionGeometry.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.self = globalThis;
await MeshoptDecoder.ready;

const ROOT = process.cwd();
const OUTPUT = path.join(
  ROOT,
  "src/app/components/stacks/scene/aboutBootSilhouettes.ts",
);
const MAX_EDGE = 220;
const SIMPLIFY_TOLERANCE = 1.35;

const MODELS = {
  globe: { file: "globe.glb", yaw: -0.7 },
  cactus: { file: "cactus.glb", yaw: -0.35 },
  "desk-lamp": { file: "desk-lamp.glb", yaw: 0.78 },
  succulent: { file: "succulent-pot.glb", yaw: -0.4 },
  "large-plant": { file: "potted-plant.glb", yaw: 0.5 },
};

const AI_MARK_SOURCE = "public/images/stacks/v8/ai-collective-mark.svg";
const TJ_SPEC_SOURCE = "src/app/components/stacks/scene/tjMedallionGeometry.js";

function triangles(scene, yaw) {
  scene.updateWorldMatrix(true, true);
  const rotation = new THREE.Matrix4().makeRotationY(yaw);
  const output = [];
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.getAttribute("position");
    const index = object.geometry.index;
    const matrix = rotation.clone().multiply(object.matrixWorld);
    const count = index ? index.count : position.count;
    for (let offset = 0; offset < count; offset += 3) {
      output.push(
        [0, 1, 2].map((corner) => {
          const vertex = index ? index.getX(offset + corner) : offset + corner;
          const point = new THREE.Vector3()
            .fromBufferAttribute(position, vertex)
            .applyMatrix4(matrix);
          return [point.x, point.y];
        }),
      );
    }
  });
  return output;
}

/** The raster envelope for a source bounding box, longest edge normalised to
 * MAX_EDGE with a one-pixel margin on every side. Exported shape so a test can
 * predict a silhouette's viewBox from its specification. */
export function viewBoxFor(sourceWidth, sourceHeight) {
  const scale = MAX_EDGE / Math.max(sourceWidth, sourceHeight);
  return [
    0,
    0,
    Math.ceil(sourceWidth * scale) + 2,
    Math.ceil(sourceHeight * scale) + 2,
  ];
}

function pointInTriangle(px, py, [a, b, c]) {
  const area = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(area) < 1e-8) return false;
  const s = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / area;
  const t = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / area;
  return s >= 0 && t >= 0 && s + t <= 1;
}

function rasterize(sourceTriangles) {
  const points = sourceTriangles.flat();
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  const sourceWidth = maxX - minX;
  const sourceHeight = maxY - minY;
  const scale = MAX_EDGE / Math.max(sourceWidth, sourceHeight);
  const [, , width, height] = viewBoxFor(sourceWidth, sourceHeight);
  const mask = new Uint8Array(width * height);
  const projected = sourceTriangles.map((triangle) =>
    triangle.map(([x, y]) => [1 + (x - minX) * scale, 1 + (maxY - y) * scale]),
  );
  const samples = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ];
  for (const triangle of projected) {
    const left = Math.max(0, Math.floor(Math.min(...triangle.map(([x]) => x))));
    const right = Math.min(
      width - 1,
      Math.ceil(Math.max(...triangle.map(([x]) => x))),
    );
    const top = Math.max(
      0,
      Math.floor(Math.min(...triangle.map(([, y]) => y))),
    );
    const bottom = Math.min(
      height - 1,
      Math.ceil(Math.max(...triangle.map(([, y]) => y))),
    );
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (
          samples.some(([dx, dy]) => pointInTriangle(x + dx, y + dy, triangle))
        ) {
          mask[y * width + x] = 1;
        }
      }
    }
  }
  return { width, height, mask };
}

async function rasterizeCollectiveMark(source) {
  // Trace the mark independently from its wider billet. Scaling both through
  // one square envelope was the source of the visibly squashed C.
  const physicalHeight = 0.18;
  const physicalWidth = physicalHeight * (700 / 844.38);
  const scale = MAX_EDGE / physicalHeight;
  const width = Math.ceil(physicalWidth * scale) + 2;
  const height = MAX_EDGE + 2;
  const mask = new Uint8Array(width * height);
  const markHeight = MAX_EDGE;
  const rendered = await sharp(source)
    .resize({ height: markHeight })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const markLeft = Math.round((width - rendered.info.width) / 2);
  const markTop = 1;
  for (let y = 0; y < rendered.info.height; y += 1) {
    for (let x = 0; x < rendered.info.width; x += 1) {
      const alpha = rendered.data[(y * rendered.info.width + x) * 4 + 3];
      if (alpha > 32) mask[(y + markTop) * width + x + markLeft] = 1;
    }
  }
  return { width, height, mask };
}

function distanceToLine(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0)
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const amount = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  return Math.hypot(
    point[0] - (start[0] + amount * dx),
    point[1] - (start[1] + amount * dy),
  );
}

function simplifyOpen(points, tolerance) {
  if (points.length <= 2) return points;
  let greatest = 0;
  let split = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToLine(
      points[index],
      points[0],
      points[points.length - 1],
    );
    if (distance > greatest) {
      greatest = distance;
      split = index;
    }
  }
  if (greatest <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplifyOpen(points.slice(0, split + 1), tolerance).slice(0, -1),
    ...simplifyOpen(points.slice(split), tolerance),
  ];
}

function simplifyLoop(points) {
  const loop = points.slice(0, -1);
  if (loop.length < 5) return loop;
  let first = 0;
  let second = 1;
  let greatest = 0;
  for (let a = 0; a < loop.length; a += 1) {
    for (let b = a + 1; b < loop.length; b += 1) {
      const distance = Math.hypot(
        loop[a][0] - loop[b][0],
        loop[a][1] - loop[b][1],
      );
      if (distance > greatest) {
        greatest = distance;
        first = a;
        second = b;
      }
    }
  }
  const rotated = [...loop.slice(first), ...loop.slice(0, first)];
  const split = (second - first + loop.length) % loop.length;
  const a = simplifyOpen(rotated.slice(0, split + 1), SIMPLIFY_TOLERANCE);
  const b = simplifyOpen(
    [...rotated.slice(split), rotated[0]],
    SIMPLIFY_TOLERANCE,
  );
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function trace({ width, height, mask }) {
  const filled = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height
      ? mask[y * width + x] === 1
      : false;
  const edges = [];
  const add = (start, end) => edges.push({ start, end, used: false });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) add([x, y], [x + 1, y]);
      if (!filled(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
      if (!filled(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
      if (!filled(x - 1, y)) add([x, y + 1], [x, y]);
    }
  }
  const byStart = new Map();
  edges.forEach((edge, index) => {
    const key = edge.start.join(",");
    const entries = byStart.get(key) ?? [];
    entries.push(index);
    byStart.set(key, entries);
  });
  const loops = [];
  for (const edge of edges) {
    if (edge.used) continue;
    edge.used = true;
    const points = [edge.start, edge.end];
    while (points.at(-1).join(",") !== points[0].join(",")) {
      const candidates = byStart.get(points.at(-1).join(",")) ?? [];
      const next = candidates
        .map((index) => edges[index])
        .find((item) => !item.used);
      if (!next) break;
      next.used = true;
      points.push(next.end);
    }
    if (points.length > 4 && points.at(-1).join(",") === points[0].join(","))
      loops.push(simplifyLoop(points));
  }
  return loops
    .filter((loop) => loop.length >= 3)
    .map(
      (loop) =>
        `M${loop
          .map(([x, y]) => `${Number(x.toFixed(1))} ${Number(y.toFixed(1))}`)
          .join("L")}Z`,
    )
    .join("");
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const generated = {};
for (const [id, model] of Object.entries(MODELS)) {
  const sourceFile = `public/models/${model.file}`;
  const sourcePath = path.join(ROOT, sourceFile);
  const source = fs.readFileSync(sourcePath);
  const buffer = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  );
  const gltf = await new Promise((resolve, reject) =>
    loader.parse(buffer, "", resolve, reject),
  );
  const raster = rasterize(triangles(gltf.scene, model.yaw));
  generated[id] = {
    source: `/models/${model.file}`,
    sourceKind: "file",
    sourceFile,
    sha256: crypto.createHash("sha256").update(source).digest("hex"),
    viewBox: [0, 0, raster.width, raster.height],
    path: trace(raster),
  };
}

const aiSource = fs.readFileSync(path.join(ROOT, AI_MARK_SOURCE));
const aiRaster = await rasterizeCollectiveMark(aiSource);
generated["ai-collective"] = {
  source: "/images/stacks/v8/ai-collective-mark.svg",
  sourceKind: "file",
  sourceFile: AI_MARK_SOURCE,
  sha256: crypto.createHash("sha256").update(aiSource).digest("hex"),
  viewBox: [0, 0, aiRaster.width, aiRaster.height],
  path: trace(aiRaster),
};

// Derived from the same specification the scene renders, not from a copy of
// its numbers. The digest covers that specification, so the freshness test
// fires when the shape changes and stays quiet when a neighbouring prop in
// AuthoredProps.tsx does not.
const tjRaster = rasterize(triangles(tjMedallionSolidGroup(THREE), 0));
const tjElevation = tjMedallionFrontElevation(THREE);
const tjExpected = viewBoxFor(tjElevation.width, tjElevation.height);
if (tjRaster.width !== tjExpected[2] || tjRaster.height !== tjExpected[3]) {
  throw new Error(
    `TJ medallion raster ${tjRaster.width}x${tjRaster.height} disagrees with the specification's front elevation ${tjExpected[2]}x${tjExpected[3]}.`,
  );
}
generated["tj-medallion"] = {
  source: "spec:TJ_MEDALLION_SOLIDS",
  sourceKind: "spec",
  sourceFile: TJ_SPEC_SOURCE,
  sha256: crypto
    .createHash("sha256")
    .update(tjMedallionSpecSignature())
    .digest("hex"),
  viewBox: [0, 0, tjRaster.width, tjRaster.height],
  path: trace(tjRaster),
};

const moduleSource =
  `// Generated by scripts/generate-about-boot-silhouettes.mjs. Do not hand-edit.\n` +
  `export const ABOUT_BOOT_MODEL_SILHOUETTES = ${JSON.stringify(generated, null, 2)} as const;\n`;
fs.writeFileSync(OUTPUT, moduleSource);
console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
