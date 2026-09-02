// Generate inline, dependency-free front silhouettes for the About boot SVG.
// The source GLBs are loaded offline, turned to their exact UnitAbout yaw,
// projected orthographically, raster-unioned, boundary-traced, and simplified.
// Run from the repository root:
//   node scripts/generate-about-boot-silhouettes.mjs
import { articulateDeskLampHead } from "../src/app/components/stacks/scene/ModelProp.tsx";
import { ABOUT_LAMP_HEAD_QUATERNION } from "../src/app/components/stacks/scene/aboutLampPose.ts";
import { ABOUT_MODEL_POSES } from "../src/app/components/stacks/scene/aboutScenePose.ts";
import {
  tjMedallionFrontElevation,
  tjMedallionSolidGroup,
  tjMedallionSpecSignature,
} from "../src/app/components/stacks/scene/tjMedallionGeometry.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";
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

const MODELS = Object.fromEntries(
  Object.entries(ABOUT_MODEL_POSES).map(([id, pose]) => [
    id,
    {
      file: pose.source.replace("/models/", ""),
      pose,
    },
  ]),
);

const AI_MARK_SOURCE = "public/images/stacks/v8/ai-collective-mark.svg";
const TJ_SPEC_SOURCE = "src/app/components/stacks/scene/tjMedallionGeometry.js";

function triangles(
  scene,
  rotation,
  localPosition = [0, 0, 0],
  include = () => true,
) {
  scene.updateWorldMatrix(true, true);
  const pose = new THREE.Matrix4().compose(
    new THREE.Vector3(...localPosition),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1),
  );
  const output = [];
  scene.traverse((object) => {
    if (!object.isMesh || !include(object)) return;
    const position = object.geometry.getAttribute("position");
    const index = object.geometry.index;
    const matrix = pose.clone().multiply(object.matrixWorld);
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

function rasterize(sourceTriangles, frame) {
  const points = sourceTriangles.flat();
  const minX = frame?.minX ?? Math.min(...points.map(([x]) => x));
  const maxX = frame?.maxX ?? Math.max(...points.map(([x]) => x));
  const minY = frame?.minY ?? Math.min(...points.map(([, y]) => y));
  const maxY = frame?.maxY ?? Math.max(...points.map(([, y]) => y));
  const sourceWidth = frame?.sourceWidth ?? maxX - minX;
  const sourceHeight = frame?.sourceHeight ?? maxY - minY;
  const scale =
    frame?.rasterScale ?? MAX_EDGE / Math.max(sourceWidth, sourceHeight);
  const [, , defaultWidth, defaultHeight] = viewBoxFor(
    sourceWidth,
    sourceHeight,
  );
  const width = frame?.width ?? defaultWidth;
  const height = frame?.height ?? defaultHeight;
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
  return {
    width,
    height,
    mask,
    minX,
    maxX,
    minY,
    maxY,
    sourceWidth,
    sourceHeight,
    rasterScale: scale,
  };
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

function formatPoint([x, y]) {
  return `${Number(x.toFixed(1))} ${Number(y.toFixed(1))}`;
}

function smoothLoopPath(loop) {
  const originalMinX = Math.min(...loop.map(([x]) => x));
  const originalMaxX = Math.max(...loop.map(([x]) => x));
  const originalMinY = Math.min(...loop.map(([, y]) => y));
  const originalMaxY = Math.max(...loop.map(([, y]) => y));
  let softened = loop.map((point) => [...point]);
  for (let pass = 0; pass < 3; pass += 1) {
    softened = softened.map((current, index) => {
      const previous =
        softened[(index - 1 + softened.length) % softened.length];
      const next = softened[(index + 1) % softened.length];
      return [
        previous[0] * 0.22 + current[0] * 0.56 + next[0] * 0.22,
        previous[1] * 0.22 + current[1] * 0.56 + next[1] * 0.22,
      ];
    });
  }
  const softenedMinX = Math.min(...softened.map(([x]) => x));
  const softenedMaxX = Math.max(...softened.map(([x]) => x));
  const softenedMinY = Math.min(...softened.map(([, y]) => y));
  const softenedMaxY = Math.max(...softened.map(([, y]) => y));
  const points = softened.map(([x, y]) => [
    originalMinX +
      ((x - softenedMinX) / (softenedMaxX - softenedMinX)) *
        (originalMaxX - originalMinX),
    originalMinY +
      ((y - softenedMinY) / (softenedMaxY - softenedMinY)) *
        (originalMaxY - originalMinY),
  ]);
  const tension = 0.72;
  const clampControl = (value, from, to) =>
    Math.max(
      Math.min(from, to) - 0.5,
      Math.min(Math.max(from, to) + 0.5, value),
    );
  const controls = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const following = points[(index + 2) % points.length];
    const first = [
      clampControl(
        current[0] + ((next[0] - previous[0]) * tension) / 6,
        current[0],
        next[0],
      ),
      clampControl(
        current[1] + ((next[1] - previous[1]) * tension) / 6,
        current[1],
        next[1],
      ),
    ];
    const second = [
      clampControl(
        next[0] - ((following[0] - current[0]) * tension) / 6,
        current[0],
        next[0],
      ),
      clampControl(
        next[1] - ((following[1] - current[1]) * tension) / 6,
        current[1],
        next[1],
      ),
    ];
    controls.push(
      `C${formatPoint(first)} ${formatPoint(second)} ${formatPoint(next)}`,
    );
  }
  return `M${formatPoint(points[0])}${controls.join("")}Z`;
}

function expandRaster(raster, radiusX, radiusY) {
  const mask = new Uint8Array(raster.mask.length);
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (!raster.mask[y * raster.width + x]) continue;
      for (let dy = -radiusY; dy <= radiusY; dy += 1) {
        for (let dx = -radiusX; dx <= radiusX; dx += 1) {
          if ((dx / radiusX) ** 2 + (dy / radiusY) ** 2 > 1) continue;
          const expandedX = x + dx;
          const expandedY = y + dy;
          if (
            expandedX >= 0 &&
            expandedY >= 0 &&
            expandedX < raster.width &&
            expandedY < raster.height
          ) {
            mask[expandedY * raster.width + expandedX] = 1;
          }
        }
      }
    }
  }
  return { ...raster, mask };
}

function trace({ width, height, mask }, { smooth = false } = {}) {
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
    .map((loop) =>
      smooth ? smoothLoopPath(loop) : `M${loop.map(formatPoint).join("L")}Z`,
    )
    .join("");
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const generated = {};
const VISION_PRO_PARTS = {
  band: (object) => /bandeau|beandeau|orange_bar|NurbsPath/.test(object.name),
  enclosure: (object) =>
    [
      "front",
      "inside_front",
      "protection",
      "protection_front",
      "protection001",
      "Plane002",
      "Plane023_1",
      "metal",
      "metal_plastic",
      "plastic001",
      "plastic002",
      "Cube007",
      "Cube007_1",
    ].includes(object.name),
  glass: (object) => {
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    return materials.some((material) => material?.name === "Front Glass");
  },
};
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
  const headQuaternion =
    id === "desk-lamp" ? ABOUT_LAMP_HEAD_QUATERNION : undefined;
  if (headQuaternion && !articulateDeskLampHead(gltf.scene, headQuaternion)) {
    throw new Error("Could not articulate the About desk-lamp head");
  }
  const modelTriangles = triangles(
    gltf.scene,
    model.pose.rotation,
    model.pose.localPosition,
  );
  const raster = rasterize(modelTriangles);
  const poseSignature = JSON.stringify({
    version: 1,
    pose: model.pose,
    headQuaternion,
  });
  const sceneUnitsPerPixel = model.pose.scale / raster.rasterScale;
  const isVisionPro = id === "vision-pro";
  const parts = isVisionPro
    ? Object.fromEntries(
        Object.entries(VISION_PRO_PARTS).map(([part, include]) => {
          const partTriangles = triangles(
            gltf.scene,
            model.pose.rotation,
            model.pose.localPosition,
            include,
          );
          let partRaster = rasterize(partTriangles, raster);
          if (part === "glass") partRaster = expandRaster(partRaster, 6, 3);
          return [part, trace(partRaster, { smooth: true })];
        }),
      )
    : undefined;
  generated[id] = {
    source: `/models/${model.file}`,
    sourceKind: "file",
    sourceFile,
    sha256: crypto.createHash("sha256").update(source).digest("hex"),
    poseSha256: crypto.createHash("sha256").update(poseSignature).digest("hex"),
    profile: [
      raster.sourceWidth * model.pose.scale,
      raster.sourceHeight * model.pose.scale,
    ],
    projection: [
      sceneUnitsPerPixel,
      0,
      0,
      sceneUnitsPerPixel,
      raster.minX * model.pose.scale - sceneUnitsPerPixel,
      -raster.maxY * model.pose.scale - sceneUnitsPerPixel,
    ],
    viewBox: [0, 0, raster.width, raster.height],
    path: trace(raster, { smooth: isVisionPro }),
    ...(parts ? { parts } : {}),
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
const tjRaster = rasterize(triangles(tjMedallionSolidGroup(THREE), [0, 0, 0]));
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
  profile: [tjRaster.sourceWidth, tjRaster.sourceHeight],
  projection: [
    1 / tjRaster.rasterScale,
    0,
    0,
    1 / tjRaster.rasterScale,
    tjRaster.minX - 1 / tjRaster.rasterScale,
    -tjRaster.maxY - 1 / tjRaster.rasterScale,
  ],
  viewBox: [0, 0, tjRaster.width, tjRaster.height],
  path: trace(tjRaster),
};

const rawModuleSource =
  `// Generated by scripts/generate-about-boot-silhouettes.mjs. Do not hand-edit.\n` +
  `export const ABOUT_BOOT_MODEL_SILHOUETTES = ${JSON.stringify(generated, null, 2)} as const;\n`;
const moduleSource = await prettier.format(rawModuleSource, {
  parser: "typescript",
});
if (process.argv.includes("--check")) {
  const committed = fs.readFileSync(OUTPUT, "utf8");
  if (committed !== moduleSource) {
    throw new Error(
      `${path.relative(ROOT, OUTPUT)} is stale. Run pnpm generate:about-boot.`,
    );
  }
  console.log(`${path.relative(ROOT, OUTPUT)} is current`);
} else {
  fs.writeFileSync(OUTPUT, moduleSource);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}
