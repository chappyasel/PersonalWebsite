// The Stacks prop pipeline — downloads the CC0 GLBs, strips the shared
// CreativeTrio palette atlas (theming happens at runtime via the themed
// atlas swap), extracts the basketball from its hoop scene, normalizes every
// prop to bottom-at-origin, meshopt-optimizes, and writes /public/models.
//
//   node scripts/stacks-models.mjs            # rebuild all GLBs
//   node scripts/stacks-models.mjs --atlas 1  # regenerate themed atlases
//                                             # (0 = stock colors, 1 = full
//                                             # theme; in between tames the
//                                             # loud stock colors only)
//
// Verified pipeline facts (docs/research/2026-08-09-stacks-v3-*.md):
// - All CreativeTrio models share ONE byte-identical 128×128 palette atlas;
//   stripping it and re-assigning a themed copy at runtime recolors the
//   whole set for ~1.1 KB per theme.
// - `gltf-transform optimize` PRUNES TEXCOORD_0 once no texture references
//   it — `--prune-attributes false` is mandatory or the props become
//   permanently unthemeable.
// - No WebP: `--texture-compress webp` writes EXT_texture_webp into
//   extensionsRequired and hard-fails non-WebP clients.
// - The basketball ships inside a hoop scene ("Basket ball and hoop",
//   Armory_3D) with a malformed `image/unknown` mimeType — keep only the
//   Sphere node, patch the mimeType, and let prune drop the rest.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "models");
const CACHE = path.join(os.tmpdir(), "stacks-models-cache");

// name → output file; strip = remove the shared palette atlas; keepNodes =
// drop every other scene node (prune removes their meshes); fixMime =
// rewrite image/unknown → image/jpeg. scale/unit are placement notes —
// the components own the live numbers.
const MANIFEST = [
  { name: "desk-lamp", id: "SF3cZuqW3s", url: "https://static.poly.pizza/4c60b118-f475-4703-bd86-61108ab5a816.glb", strip: true, unit: "about+talks", scale: 1.0 },
  { name: "mug", id: "4jSgnM5WWk", url: "https://static.poly.pizza/6be3fa9a-e9f1-4b2f-996f-dc711a4340fa.glb", strip: true, unit: "about+blog", scale: 1.0 },
  { name: "potted-plant", id: "GJ3Bm5FDE4", url: "https://static.poly.pizza/05ba8d9a-adb7-403d-a60c-e2f685bdc250.glb", strip: true, unit: "systems", scale: 1.25 },
  { name: "alarm-clock", id: "y5f363OS9C", url: "https://static.poly.pizza/d86c60be-ae6e-4757-9c9c-0531796c24c2.glb", strip: true, unit: "systems", scale: 1.6 },
  { name: "headphones", id: "PSsWSIAYIL", url: "https://static.poly.pizza/b72a848f-b4c6-40fb-ada7-69c4c524bd27.glb", strip: true, unit: "blog", scale: 2.0 },
  { name: "dumbbell", id: "PW9q10xh5g", url: "https://static.poly.pizza/a9b5fb20-6ecb-4f20-996f-88743f2519da.glb", strip: true, unit: "training", scale: 1.1 },
  { name: "globe", id: "Y4Dof9b2p5", url: "https://static.poly.pizza/002557d4-03f3-4201-a86c-f66e0af82182.glb", strip: true, unit: "about", scale: 1.5 },
  { name: "trophy", id: "fLy8KmmD1t", url: "https://static.poly.pizza/b56b0827-c9f6-46e6-9a5d-160225686ee7.glb", strip: true, unit: "projects", scale: 1.2 },
  { name: "open-book", id: "JEDMpG0UIR", url: "https://static.poly.pizza/64810c3b-57be-44be-aaba-926b56a0cebc.glb", unit: "blog", scale: 0.7 },
  { name: "golf-club", id: "26nMm9C7Bw", url: "https://static.poly.pizza/940b6e7e-09ab-414a-8243-fc63a3faa9fd.glb", unit: "training", scale: 1.6 },
  { name: "basketball", id: "i3LLacyQP4", url: "https://static.poly.pizza/d4a3995f-5823-4d31-b4ed-a27a0700e896.glb", keepNodes: ["Sphere"], fixMime: true, unit: "training", scale: 0.39 },
];

function parseGlb(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  return { json, bin };
}

function buildGlb(json, bin) {
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binBuf = Buffer.concat([bin, Buffer.alloc(binPad)]);
  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); // glTF
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // JSON
  jsonBuf.copy(out, 20);
  out.writeUInt32LE(binBuf.length, 20 + jsonBuf.length);
  out.writeUInt32LE(0x004e4942, 24 + jsonBuf.length); // BIN
  binBuf.copy(out, 28 + jsonBuf.length);
  return out;
}

async function download(url, name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const cached = path.join(CACHE, `${name}.glb`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cached, buf);
  return buf;
}

function surgery(buf, spec) {
  const { json, bin } = parseGlb(buf);
  if (spec.strip) {
    // Remove the embedded shared atlas; optimize's prune repacks the bin.
    delete json.images;
    delete json.textures;
    delete json.samplers;
    for (const mat of json.materials ?? []) {
      if (mat.pbrMetallicRoughness) delete mat.pbrMetallicRoughness.baseColorTexture;
    }
  }
  if (spec.fixMime) {
    for (const img of json.images ?? []) {
      if (img.mimeType === "image/unknown") img.mimeType = "image/jpeg";
    }
  }
  if (spec.keepNodes) {
    // Keep matching nodes plus their ancestors (transform path); prune every
    // other branch — optimize's prune then drops the orphaned meshes.
    const keep = new Array((json.nodes ?? []).length).fill(false);
    const visit = (i) => {
      const n = json.nodes[i];
      let k = spec.keepNodes.includes(n.name);
      for (const c of n.children ?? []) if (visit(c)) k = true;
      keep[i] = k;
      return k;
    };
    for (const scene of json.scenes ?? []) scene.nodes.forEach(visit);
    if (!keep.some(Boolean)) throw new Error(`keepNodes matched nothing: ${spec.keepNodes}`);
    for (const n of json.nodes ?? []) {
      if (n.children) n.children = n.children.filter((c) => keep[c]);
    }
    for (const scene of json.scenes ?? []) {
      scene.nodes = scene.nodes.filter((i) => keep[i]);
    }
  }
  return buildGlb(json, bin);
}

async function buildModels() {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stacks-glb-"));
  let total = 0;
  for (const spec of MANIFEST) {
    const raw = await download(spec.url, spec.name);
    const cut = surgery(raw, spec);
    const pre = path.join(tmp, `${spec.name}.pre.glb`);
    const centered = path.join(tmp, `${spec.name}.center.glb`);
    const out = path.join(OUT, `${spec.name}.glb`);
    fs.writeFileSync(pre, cut);
    // Bottom-at-origin matches the shelf convention (local y=0 = contact).
    execFileSync("npx", ["--yes", "@gltf-transform/cli", "center", pre, centered, "--pivot", "below"], { stdio: "pipe" });
    execFileSync(
      "npx",
      ["--yes", "@gltf-transform/cli", "optimize", centered, out, "--compress", "meshopt", "--prune-attributes", "false", "--texture-compress", "false"],
      { stdio: "pipe" },
    );
    const size = fs.statSync(out).size;
    total += size;
    console.log(`${spec.name.padEnd(14)} ${(size / 1024).toFixed(1).padStart(6)} KB  (${spec.id}, raw ${(raw.length / 1024).toFixed(1)} KB)`);
  }
  for (const f of ["atlas-dark.png", "atlas-light.png"]) {
    const p = path.join(OUT, f);
    if (fs.existsSync(p)) total += fs.statSync(p).size;
  }
  console.log(`total (incl. themed atlases): ${(total / 1024).toFixed(1)} KB`);
}

// ---- themed atlas generation (nearest-match remap of the shared palette
// atlas, authored against src/app/components/stacks/theme.ts) ----
const DOMINANT = ["462720", "a24444", "cf6d34", "242227", "8f0951", "67ea66", "e7c451", "3ab7d9", "e7e7e7", "8b8b8b", "c3a391", "3b3b3b", "315e94", "3e3f57", "141414", "ff7797", "75af6d", "c54747", "b27757"];
const ROLES = ["dk-brown", "brick", "orange", "charcoal", "magenta", "lime", "gold", "cyan", "white", "grey", "tan", "dk-grey", "blue", "slate", "black", "pink", "green", "red", "lt-brown"];
const THEMES = {
  dark: { "dk-brown": "#453521", brick: "#7a4a2f", orange: "#9c6b4f", charcoal: "#241d14", magenta: "#63412f", lime: "#5c5b3a", gold: "#8a7358", cyan: "#3f4a5c", white: "#c9bda4", grey: "#75634e", tan: "#b3a68f", "dk-grey": "#3b2e1f", blue: "#3f4a5c", slate: "#54483b", black: "#241d14", pink: "#7a5a3e", green: "#5c5b3a", red: "#8a4a30", "lt-brown": "#5c4832" },
  light: { "dk-brown": "#8f7150", brick: "#9c4f38", orange: "#a5764c", charcoal: "#443a2d", magenta: "#84573f", lime: "#5c5648", gold: "#c2a377", cyan: "#6e7f95", white: "#f4ecdb", grey: "#a4917a", tan: "#dccdb4", "dk-grey": "#6e5d49", blue: "#6e7f95", slate: "#5c5648", black: "#443a2d", pink: "#b8926a", green: "#5c5648", red: "#9c4f38", "lt-brown": "#b3906a" },
};

async function buildAtlases(mix) {
  fs.mkdirSync(OUT, { recursive: true });
  const { default: sharp } = await import("sharp");
  // The source atlas ships inside every CreativeTrio GLB — pull it from the
  // desk lamp download instead of committing a copy.
  const raw = await download(MANIFEST[0].url, MANIFEST[0].name);
  const { json, bin } = parseGlb(raw);
  const img = json.images?.[0];
  if (!img) throw new Error("no embedded atlas in source GLB");
  const view = json.bufferViews[img.bufferView];
  const png = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16));
  const dom = DOMINANT.map((d) => rgb("#" + d));
  for (const [theme, map] of Object.entries(THEMES)) {
    const out = Buffer.from(data);
    for (let p = 0; p < info.width * info.height; p++) {
      const px = [data[p * info.channels], data[p * info.channels + 1], data[p * info.channels + 2]];
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < dom.length; i++) {
        const d = (px[0] - dom[i][0]) ** 2 + (px[1] - dom[i][1]) ** 2 + (px[2] - dom[i][2]) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      const target = rgb(map[ROLES[best]]);
      for (let c = 0; c < 3; c++) out[p * info.channels + c] = Math.round(px[c] + (target[c] - px[c]) * mix);
    }
    const file = path.join(OUT, `atlas-${theme}.png`);
    await sharp(out, { raw: info }).png({ palette: true }).toFile(file);
    console.log(`atlas-${theme}.png ${(fs.statSync(file).size / 1024).toFixed(2)} KB (mix ${mix})`);
  }
}

const atlasArg = process.argv.indexOf("--atlas");
if (atlasArg !== -1) {
  await buildAtlases(Number(process.argv[atlasArg + 1] ?? 1));
} else {
  await buildModels();
}
