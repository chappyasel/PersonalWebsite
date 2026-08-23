// Homepage 3D scene prop pipeline — downloads the curated GLBs, strips the shared
// CreativeTrio palette atlas (theming happens at runtime via the themed
// atlas swap), palette-remaps own-texture props into per-theme textures,
// extracts the basketball from its hoop scene, normalizes every prop to
// bottom-at-origin, meshopt-optimizes, and writes /public/models plus the
// license manifest.
//
//   node scripts/stacks-models.mjs            # rebuild all GLBs + LICENSES
//   node scripts/stacks-models.mjs --atlas 1  # regenerate themed atlases
//                                             # (0 = stock colors, 1 = full
//                                             # theme; in between tames the
//                                             # loud stock colors only)
//   node scripts/stacks-models.mjs --ao       # rebuild with vertex AO baked
//                                             # into COLOR_0 (P4 consumes it
//                                             # via vertexColors materials)
//   node scripts/stacks-models.mjs --inspect alarm-clock
//                                             # print front-plane clusters
//                                             # (dial registration data)
//
// Verified pipeline facts (docs/research/2026-08-09-stacks-v3-*.md + v4):
// - All CreativeTrio models share ONE byte-identical 128×128 palette atlas;
//   stripping it and re-assigning a themed copy at runtime recolors the
//   whole set for ~1.1 KB per theme.
// - `gltf-transform optimize` PRUNES TEXCOORD_0 once no texture references
//   it — `--prune-attributes false` is mandatory or the props become
//   permanently unthemeable. (It also keeps COLOR_0 for the AO bake.)
// - No WebP: `--texture-compress webp` writes EXT_texture_webp into
//   extensionsRequired and hard-fails non-WebP clients.
// - The basketball ships inside a hoop scene ("Basket ball and hoop",
//   Armory_3D) with a malformed `image/unknown` mimeType — keep only the
//   Sphere node, patch the mimeType, and let prune drop the rest. Its
//   faceted normals are smoothed AT LOAD in ModelProp (weld + regenerate) —
//   node-side GLTFExporter cannot round-trip its embedded texture.
// - `recolor` props keep their own UVs; Isa Lousberg's "tiny treats" set
//   ships ONE texture byte for byte across every prop in it — a second
//   palette atlas, same story as CreativeTrio's — so it is remapped through
//   the SAME dominant→role→theme tables and written ONCE to
//   /models/tiny-treats-{light,dark}.png (the GLBs ship textureless).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "models");
const CACHE = path.join(os.tmpdir(), "stacks-models-cache");
// Shared output name for the tiny-treats pair — see the header note.
const RECOLOR_ATLAS = "tiny-treats";

// name → output file; strip = remove the shared palette atlas; recolor =
// remap own texture per theme + strip; keepNodes = drop every other scene
// node (prune removes their meshes); fixMime = rewrite image/unknown →
// image/jpeg; simplify = decimation error as a fraction of mesh extent
// (optimize's own default, 0.0001, keeps every vertex). scale/unit are
// placement notes — the components own the live numbers. license/author/page
// feed public/models/LICENSES.json.
const MANIFEST = [
  {
    name: "desk-lamp",
    id: "SF3cZuqW3s",
    url: "https://static.poly.pizza/4c60b118-f475-4703-bd86-61108ab5a816.glb",
    strip: true,
    unit: "about+talks",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "mug",
    id: "4jSgnM5WWk",
    url: "https://static.poly.pizza/6be3fa9a-e9f1-4b2f-996f-dc711a4340fa.glb",
    strip: true,
    unit: "about+blog",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "alarm-clock",
    id: "y5f363OS9C",
    url: "https://static.poly.pizza/d86c60be-ae6e-4757-9c9c-0531796c24c2.glb",
    strip: true,
    unit: "systems",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "headphones",
    id: "PSsWSIAYIL",
    url: "https://static.poly.pizza/b72a848f-b4c6-40fb-ada7-69c4c524bd27.glb",
    strip: true,
    unit: "blog",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "dumbbell",
    id: "PW9q10xh5g",
    url: "https://static.poly.pizza/a9b5fb20-6ecb-4f20-996f-88743f2519da.glb",
    strip: true,
    unit: "training",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "golf-tee",
    id: "1glx8YEqY9F",
    url: "https://static.poly.pizza/d2242167-f0bc-4bcf-9274-b48a95af4b5a.glb",
    unit: "training",
    author: "Poly by Google",
    license: "CC-BY 3.0",
    page: "https://poly.pizza/m/1glx8YEqY9F",
  },
  {
    name: "golf-flag",
    id: "hCznL0BXnD",
    url: "https://static.poly.pizza/a4ed397b-e5b2-4f69-80fa-73cc492c484e.glb",
    unit: "training meadow",
    author: "Arif",
    license: "CC-BY 4.0",
    page: "https://poly.pizza/m/hCznL0BXnD",
  },
  {
    name: "globe",
    id: "Y4Dof9b2p5",
    url: "https://static.poly.pizza/002557d4-03f3-4201-a86c-f66e0af82182.glb",
    strip: true,
    unit: "about",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "trophy",
    id: "fLy8KmmD1t",
    url: "https://static.poly.pizza/b56b0827-c9f6-46e6-9a5d-160225686ee7.glb",
    strip: true,
    unit: "projects",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "open-book",
    id: "JEDMpG0UIR",
    url: "https://static.poly.pizza/64810c3b-57be-44be-aaba-926b56a0cebc.glb",
    noAo: true,
    unit: "blog",
    author: "Quaternius",
    license: "CC0 1.0",
  },
  // noAo below: thin members / dark tints where baked AO never reads —
  // their bytes matter more than their crevices. /public/models is a soft
  // ~420 KB ceiling (398 KB as of round 4) — it is lazy-loaded after first
  // paint, so it sits OUTSIDE the 180 KB initial-route budget that
  // scripts/check-route-budgets.mjs asserts. Nothing fails the build on it;
  // the per-prop and total KB this script prints are the only guard.
  {
    name: "golf-club",
    id: "26nMm9C7Bw",
    url: "https://static.poly.pizza/940b6e7e-09ab-414a-8243-fc63a3faa9fd.glb",
    noAo: true,
    unit: "training",
    author: "Pichuliru",
    license: "CC0 1.0",
  },
  {
    name: "basketball",
    id: "i3LLacyQP4",
    url: "https://static.poly.pizza/d4a3995f-5823-4d31-b4ed-a27a0700e896.glb",
    keepNodes: ["Sphere"],
    fixMime: true,
    noAo: true,
    unit: "training",
    author: "Armory_3D",
    license: "CC0 1.0",
  },
  // ---- v4 round 2: CC0 atlas-shared drop-ins
  {
    name: "cup-tea",
    id: "6QBscrL7D3",
    url: "https://static.poly.pizza/10923bae-556b-4540-8b37-2edaaa78083d.glb",
    strip: true,
    unit: "blog",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "corkboard",
    id: "U8yQZ9l0HZ",
    url: "https://static.poly.pizza/09cf2ec1-8b2c-4543-b773-962fba13aac5.glb",
    strip: true,
    noAo: true,
    unit: "blog",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "grandfather-clock",
    id: "09YKIkFZnA",
    url: "https://static.poly.pizza/88145813-946f-4490-abe5-e3938775991a.glb",
    strip: true,
    unit: "systems floor",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  // The library ladder was owner-killed at browse in v7 ("let's just get rid
  // of the ladder"), after v4 added it and v6 fixed its footing. Entry removed
  // rather than left dangling: nothing references it and the pipeline is what
  // decides what ships.
  // ---- v4 round 2: CC0 own-texture (palette remap per theme)
  {
    name: "sansevieria",
    id: "BDwimVUool",
    url: "https://static.poly.pizza/f972935d-4083-474a-aa51-af7ceec71797.glb",
    recolor: true,
    noAo: true,
    unit: "systems",
    author: "Isa Lousberg",
    license: "CC0 1.0",
  },
  // ---- v4 round 3: more species. One sansevieria was carrying every plant
  // in a seven-unit room. The whole family is noAo (the sansevieria
  // included, which is what pays for the other two): blades, leaves and pot
  // rims are the thin members the bake can't reach, and the budget notices.
  // Isa's plants decimate BADLY — her leaves are separate flat pieces welded
  // to nothing, so past ~0.04 error meshoptimizer eats the stems and leaves
  // the foliage hanging in the air. 0.02 is the floor that still looks like
  // a plant, and it is why there are two of these and not four.
  {
    name: "potted-plant",
    id: "GJ3Bm5FDE4",
    url: "https://static.poly.pizza/05ba8d9a-adb7-403d-a60c-e2f685bdc250.glb",
    strip: true,
    noAo: true,
    unit: "about",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "pothos",
    id: "JVoJ2itVzh",
    url: "https://static.poly.pizza/8e0f9c34-b4d2-4488-aa47-2c032b8ced88.glb",
    recolor: true,
    noAo: true,
    simplify: 0.02,
    unit: "projects",
    author: "Isa Lousberg",
    license: "CC0 1.0",
  },
  // ---- v4 round 2: CC-BY (credited in LICENSES.json + About placard).
  // All three carry plain materials (no textures) — themed at runtime via
  // the "tinted" variant: barbell Iron1Barbell1/Steel1Barbell1, kettlebell
  // phong1SG, plate PorcelainPlate1 (a porcelain disc that reads as a
  // bumper plate once tinted and leaned). v4.1: the plate/mic were owner-
  // killed at browse (dinnerware read / out-of-place) — procedural bumpers
  // and a framed photo replaced them.
  {
    name: "barbell",
    id: "AX5jGlJZlk",
    url: "https://static.poly.pizza/4915af72-c243-407c-960c-272a4ce73d97.glb",
    noAo: true,
    unit: "training",
    author: "Zsky",
    license: "CC-BY 3.0",
  },
  {
    name: "kettlebell",
    id: "08Gs4e3L1N8",
    url: "https://static.poly.pizza/9044238c-c3ef-47ae-a8e1-5a140cb64e78.glb",
    unit: "training",
    author: "Poly by Google",
    license: "CC-BY 3.0",
  },
  // ---- v4 round 4: the owner's named asks (Eames / Mac / +2 lamps / +2 plants).
  // eames-chair is the honest near-miss: poly.pizza has NO Eames lounge (no
  // plywood shells, no ottoman, no star base). This is the site's top
  // mid-century-modern chair — upholstered one-piece shell on splayed
  // tapered wood dowel legs. Plain materials, so the runtime "tinted"
  // variant drives it: Cloth1MinimalistModernChair1 (upholstery) and
  // WoodMinimalistModernChair1 (legs). Zsky is already a credited CC-BY
  // author (barbell), so it adds no new name to the About placard.
  // The Mac ships as a desk scene (keyboard/keys/mouse/mousepad); keyboard
  // _keys alone is 272 of its 556 tris and none of it reads at 25px. Keep
  // only the compact-Mac body plus the two Happy-Mac screen quads — face and
  // face_shadow have to be named explicitly because keepNodes prunes any
  // child that is not itself matched. M_screen_blue / M_screen_whitetext are
  // the screen materials a tinted variant must leave alone or the Mac stops
  // reading as switched on.
  {
    name: "mac",
    id: "goeJLARWbs",
    url: "https://static.poly.pizza/3e43bb1d-0715-4b84-849a-3ae813a6ffed.glb",
    keepNodes: ["monitor_and_body", "face", "face_shadow"],
    unit: "projects (github link)",
    author: "Charlie",
    license: "CC-BY 3.0",
  },
  {
    name: "lamp-table",
    id: "1nKtMmYxLT",
    url: "https://static.poly.pizza/cc9fbab2-f93f-4dfc-947b-b91f10a7b6bb.glb",
    strip: true,
    unit: "books+blog",
    author: "CreativeTrio",
    license: "CC0 1.0",
  },
  {
    name: "lamp-floor",
    id: "8LiDIfXVLi",
    url: "https://static.poly.pizza/98dd45a1-0682-4d44-83d1-32fa2a4fca5b.glb",
    noAo: true,
    unit: "floor",
    author: "Kenney",
    license: "CC0 1.0",
  },
  // Two more species, same tiny-treats atlas as pothos/sansevieria (verified
  // byte-identical by the hash check below). Medium monstera not large: the
  // large one is 5.9k tris for the same silhouette. Both noAo + 0.02 for the
  // reasons in the round-3 note above.
  {
    name: "monstera",
    id: "mhLLD0UJ5n",
    url: "https://static.poly.pizza/25c47ae4-e64f-42cc-8ef7-9f7a69907c92.glb",
    recolor: true,
    noAo: true,
    simplify: 0.02,
    unit: "about",
    author: "Isa Lousberg",
    license: "CC0 1.0",
  },
  {
    name: "cactus",
    id: "ktF2FMl1eT",
    url: "https://static.poly.pizza/241caab1-030a-4879-8a37-982b7e5d2f49.glb",
    recolor: true,
    noAo: true,
    simplify: 0.02,
    unit: "systems",
    author: "Isa Lousberg",
    license: "CC0 1.0",
  },
  // Owner-selected v8 plants. Both pages identify Isa Lousberg as creator and
  // CC0 1.0; both embedded images hash byte-for-byte to the existing
  // tiny-treats atlas (sha1 aa1e2f65…), so they add geometry only and reuse
  // the one themed texture already paid for by pothos/sansevieria.
  {
    name: "succulent-pot",
    title: "Succulent Pot",
    id: "y3zjCa6BeR",
    url: "https://static.poly.pizza/c3c99f98-5d16-449b-a24e-29564a3a6c64.glb",
    recolor: true,
    noAo: true,
    simplify: 0.02,
    unit: "about",
    author: "Isa Lousberg",
    license: "CC0 1.0",
  },
  {
    name: "yucca-plant",
    title: "Yucca Plant",
    id: "uKRTMhxfiu",
    url: "https://static.poly.pizza/4a45783b-8c84-46d6-81cb-82dd3e7a971a.glb",
    recolor: true,
    noAo: true,
    simplify: 0.02,
    unit: "projects-musings floor",
    author: "Isa Lousberg",
    license: "CC0 1.0",
  },
  // Owner-approved 2026-08-15 after the three-angle source/scene-ready review.
  // Plain untextured materials remain named, so UnitAbout owns the restrained
  // dawn palette through ModelProp's tinted variant. 1,020 triangles is the
  // inspected 20-triangle exception recorded in the approval ledger.
  {
    name: "sailboat",
    title: "Sail Boat",
    id: "BgSZXwmm7k",
    url: "https://static.poly.pizza/b1d42c7e-152a-4d56-a754-cca000a5abad.glb",
    noAo: true,
    unit: "musings",
    author: "Quaternius",
    license: "CC0 1.0",
  },
  // Owner-requested 2026-08-15 shelf props. Each source page identifies the
  // model as CC-BY and the pipeline keeps the original geometry/materials;
  // scene components only scale, orient and (where useful) tint named plain
  // materials. These remain candidates until the inspector and in-scene
  // comparison checks recorded in the source-asset ledger pass.
  {
    name: "phone",
    title: "Phone",
    id: "1L9oJAw6nY2",
    url: "https://static.poly.pizza/eeb96574-1c13-426a-acb4-6a21d4b49a8e.glb",
    noAo: true,
    simplify: 0.02,
    unit: "projects",
    author: "Alex Safayan",
    license: "CC-BY 3.0",
  },
  {
    name: "notebook",
    title: "Notebook",
    id: "9Ptsg_xZt6B",
    url: "https://static.poly.pizza/d9b91830-403d-4f37-a2bc-45e99137afa9.glb",
    noAo: true,
    unit: "projects",
    author: "jeremy",
    license: "CC-BY 3.0",
  },
  {
    name: "harmonica",
    title: "Harmonica",
    id: "8Aw334FnDZE",
    url: "https://static.poly.pizza/e8f94a73-e848-428d-b847-6a966f867ecd.glb",
    texMax: 128,
    noAo: true,
    simplify: 0.02,
    unit: "talks",
    author: "Poly by Google",
    license: "CC-BY 3.0",
  },
  // ---- v7 removals. These four had no call site left and were still being
  // downloaded, built and PRELOADED, i.e. paid for on every visit while
  // rendering nothing (44 KB between them). ct-books became a real per-spine
  // BookRowMesh so its spines could hover one at a time; the ladder and the
  // eames-chair were owner-killed at browse; armchair had been dead since v5,
  // when the About chair was swapped for the eames and nothing removed it.
  // Deleting the manifest entry is what actually removes a prop — the pipeline
  // writes public/models but never prunes it, so the stale .glb must go too.
  // ---- v7: the owner's own picks, browsed on poly.pizza and chosen by him.
  //
  // All three carry PLAIN UNTEXTURED materials — verified, zero images in any
  // of them — so none needs `strip` or `recolor`. They theme at runtime
  // through the "tinted" variant keyed on material name, the same path the
  // barbell, kettlebell and Mac already take. The material names each prop
  // exposes are listed below because that list IS the theming interface, and
  // reading it off the GLB beats guessing at it from the component.
  //
  // couch replaces eames-chair as the About seat, on his preference. It is a
  // two-seat couch rather than a lounge chair, so the seated eye has to move:
  // SEAT_POSE in scene/seated.ts was measured against the eames hull and is
  // re-measured against this one. 852 tris.
  //   Couch_Blue = upholstery, Black = base.
  {
    name: "couch",
    id: "ZOPP3KzNIk",
    url: "https://static.poly.pizza/4e8fbbf3-9992-4068-8918-2126a0304127.glb",
    unit: "about floor",
    author: "Quaternius",
    license: "CC0 1.0",
  },
  // The can is 312 tris, which is why it can afford to appear several times in
  // different colours. Its materials are named for their stock hex, so the
  // body tint is the `F44336` slot; the other two are the base ring and the
  // pull tab and should stay neutral or the can stops reading as aluminium.
  // NEW CC-BY AUTHOR: "jeremy" joins the credits line in the About placard.
  {
    name: "soda-can",
    id: "cNjAaDY27fQ",
    url: "https://static.poly.pizza/1be087d0-ab82-47b6-84c8-9f9ea9060fd9.glb",
    noAo: true,
    unit: "training+projects+blog",
    author: "jeremy",
    license: "CC-BY 3.0",
  },
  // 104 tris, the cheapest prop in the room by a distance. Zsky is already a
  // credited CC-BY author (barbell), so it adds no new name.
  //   Plastic1Protein1 = tub, Lid1Protein1 = lid.
  {
    name: "protein-powder",
    id: "w9sWcWlV9i",
    url: "https://static.poly.pizza/4e9e8127-6819-4af1-afc2-be217d93859d.glb",
    unit: "training",
    author: "Zsky",
    license: "CC-BY 3.0",
  },
  // The Talks mic. Unlike the three above it DOES carry its own texture, and
  // it is the reason `texMax` exists — see the note at the resize step. The
  // map is pure greyscale shading over one material (lambert2SG), so it
  // survives a runtime tint rather than fighting it. 184 tris.
  // Poly by Google is already a credited CC-BY author (kettlebell).
  {
    name: "microphone",
    id: "bD-LseANe2b",
    url: "https://static.poly.pizza/67e327c3-3925-4750-9b1a-95794c810c07.glb",
    texMax: 128,
    noAo: true,
    unit: "talks",
    author: "Poly by Google",
    license: "CC-BY 3.0",
  },
  // Owner pick 2026-08-22: Kenney's "Bag" — a standing gusseted bag, 46 tris,
  // one flat material, big faces on ±x (0.41 wide × 0.6 tall × 0.22 deep in
  // its own units). Placed three times on the Systems shelf as the frozen
  // chicken bags; the scene ignores its palette UVs and projects an
  // owner-drawn label straight onto the front face at load
  // (scene/bagLabelUvs.ts). noAo: six flat faces, nothing for a bake to
  // find. CC0, no credit line. (Replaced the Quaternius three-sack pile,
  // which read as one small cushion rather than three bags.)
  {
    name: "bag",
    title: "Bag",
    id: "fLNcjJnsJi",
    url: "https://static.poly.pizza/4473a789-f73a-47d4-b73a-0e015b643325.glb",
    noAo: true,
    unit: "systems",
    author: "Kenney",
    license: "CC0 1.0",
  },
];

// Assets adapted directly from open-source repositories rather than fetched
// from Poly Pizza. They still belong in the generated public roster so a
// routine model-pipeline run can never erase a required notice.
const VENDORED_LICENSES = [
  {
    file: "grass-tuft.glb",
    title: "FluffyGrass tuft LODs (with grass-tuft-alpha.webp)",
    author: "Ebenezer (thebenezer)",
    license: "MIT",
    source: "https://github.com/thebenezer/FluffyGrass",
  },
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

/** Pull the first embedded image out of a GLB. */
function extractImage(json, bin) {
  const img = json.images?.[0];
  if (!img) return null;
  const view = json.bufferViews[img.bufferView];
  return bin.subarray(
    view.byteOffset ?? 0,
    (view.byteOffset ?? 0) + view.byteLength,
  );
}

function stripTextures(json) {
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const mat of json.materials ?? []) {
    if (mat.pbrMetallicRoughness) {
      delete mat.pbrMetallicRoughness.baseColorTexture;
      delete mat.pbrMetallicRoughness.metallicRoughnessTexture;
      // A leftover dark baseColorFactor would multiply the runtime texture.
      mat.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
    }
    delete mat.normalTexture;
    delete mat.occlusionTexture;
    delete mat.emissiveTexture;
  }
}

function surgery(buf, spec) {
  const { json, bin } = parseGlb(buf);
  if (spec.strip || spec.recolor) stripTextures(json);
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
    if (!keep.some(Boolean))
      throw new Error(`keepNodes matched nothing: ${spec.keepNodes}`);
    for (const n of json.nodes ?? []) {
      if (n.children) n.children = n.children.filter((c) => keep[c]);
    }
    for (const scene of json.scenes ?? []) {
      scene.nodes = scene.nodes.filter((i) => keep[i]);
    }
  }
  return buildGlb(json, bin);
}

// ---- shared palette tables (authored against src/app/components/stacks/
// theme.ts). DOMINANT are the source atlas's 19 dominant colors; any pixel
// (atlas or own-texture) snaps to its nearest dominant, takes that ROLE, and
// lands on the theme hex. v4: green/lime/cyan/blue DIVERGE — v3 mapped them
// to near-identical warm greys, which flattened the globe to a checkerboard
// and the plant to dead khaki.
const DOMINANT = [
  "462720",
  "a24444",
  "cf6d34",
  "242227",
  "8f0951",
  "67ea66",
  "e7c451",
  "3ab7d9",
  "e7e7e7",
  "8b8b8b",
  "c3a391",
  "3b3b3b",
  "315e94",
  "3e3f57",
  "141414",
  "ff7797",
  "75af6d",
  "c54747",
  "b27757",
];
const ROLES = [
  "dk-brown",
  "brick",
  "orange",
  "charcoal",
  "magenta",
  "lime",
  "gold",
  "cyan",
  "white",
  "grey",
  "tan",
  "dk-grey",
  "blue",
  "slate",
  "black",
  "pink",
  "green",
  "red",
  "lt-brown",
];
const THEMES = {
  dark: {
    "dk-brown": "#453521",
    brick: "#8f4a2c",
    orange: "#a86c46",
    charcoal: "#241d14",
    magenta: "#6d3f28",
    lime: "#6d7c42",
    gold: "#94795a",
    cyan: "#3c5a72",
    white: "#c9bda4",
    grey: "#7a6650",
    tan: "#b3a68f",
    "dk-grey": "#3b2e1f",
    blue: "#334d68",
    slate: "#57493a",
    black: "#241d14",
    pink: "#8a5f48",
    green: "#5a6a38",
    red: "#8a4a30",
    "lt-brown": "#5c4832",
  },
  light: {
    "dk-brown": "#826645",
    brick: "#9c4f38",
    orange: "#a5764c",
    charcoal: "#443a2d",
    magenta: "#84573f",
    lime: "#7a8f56",
    gold: "#c2a377",
    cyan: "#5c7f9c",
    white: "#f4ecdb",
    grey: "#a4917a",
    tan: "#dccdb4",
    "dk-grey": "#6e5d49",
    blue: "#4c6d90",
    slate: "#5c5648",
    black: "#443a2d",
    pink: "#b8926a",
    green: "#5f7a48",
    red: "#9c4f38",
    "lt-brown": "#a5845f",
  },
};
// Role overrides for the remap — { role: [light, dark] }, keyed by whichever
// prop writes the shared pair, so an entry moves EVERY prop that samples it.
// Empty today (the gym set turned out material-based); the hook stays for
// pixels that land on the wrong role.
const ROLE_OVERRIDES = {};

const rgb = (hex) =>
  [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16));

/** Nearest-dominant palette remap of raw RGBA pixels toward one theme. */
function remapPixels(data, channels, count, themeMap, mix) {
  const dom = DOMINANT.map((d) => rgb("#" + d));
  const targets = dom.map((_, i) => rgb(themeMap[ROLES[i]]));
  const out = Buffer.from(data);
  for (let p = 0; p < count; p++) {
    const px = [
      data[p * channels],
      data[p * channels + 1],
      data[p * channels + 2],
    ];
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < dom.length; i++) {
      const d =
        (px[0] - dom[i][0]) ** 2 +
        (px[1] - dom[i][1]) ** 2 +
        (px[2] - dom[i][2]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    for (let c = 0; c < 3; c++)
      out[p * channels + c] = Math.round(
        px[c] + (targets[best][c] - px[c]) * mix,
      );
  }
  return out;
}

/** Write the tiny-treats-{light,dark}.png pair every recolor prop shares. */
async function recolorTexture(spec, png) {
  const { default: sharp } = await import("sharp");
  // 256px is plenty for palette-flat low-poly textures and keeps PNGs tiny.
  const src = sharp(png).resize(256, 256, {
    fit: "inside",
    withoutEnlargement: true,
  });
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  for (const [theme, baseMap] of Object.entries(THEMES)) {
    const overrides = ROLE_OVERRIDES[spec.name];
    const map = { ...baseMap };
    if (overrides) {
      for (const [role, [light, dark]] of Object.entries(overrides)) {
        map[role] = theme === "light" ? light : dark;
      }
    }
    const out = remapPixels(
      data,
      info.channels,
      info.width * info.height,
      map,
      1,
    );
    const file = path.join(OUT, `${RECOLOR_ATLAS}-${theme}.png`);
    await sharp(out, { raw: info }).png({ palette: true }).toFile(file);
  }
}

function writeLicenses() {
  const entries = [
    ...MANIFEST.map((m) => ({
      file: `${m.name}.glb`,
      title: m.title ?? m.name,
      author: m.author,
      license: m.license,
      source: `https://poly.pizza/m/${m.id}`,
    })),
    ...VENDORED_LICENSES,
  ];
  const ccby = [
    ...new Set(
      entries.filter((e) => e.license.startsWith("CC-BY")).map((e) => e.author),
    ),
  ];
  const manifest = {
    generated: "scripts/stacks-models.mjs",
    note: "Source models are CC0 except the credited CC-BY set and the vendored MIT FluffyGrass asset below.",
    attributionRequired: ccby,
    models: entries,
  };
  const file = path.join(OUT, "LICENSES.json");
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `\nLICENSES.json written — CC-BY credits required for: ${ccby.join(", ")}`,
  );
  console.log(
    `suggested credit line: “3D props include CC-BY work by ${ccby.join(", ")}.”`,
  );
}

// ---- vertex-AO bake (COLOR_0) — node-side three raycast, pre-optimize.
async function aoBake(preFile, aoFile) {
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
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = ab;
        this.onloadend?.();
      });
    }
  };
  const [{ GLTFLoader, GLTFExporter }, THREE] = await Promise.all([
    import("three-stdlib"),
    import("three"),
  ]);
  const buf = fs.readFileSync(preFile);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) =>
    new GLTFLoader().parse(ab, "", res, rej),
  );
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  const raycaster = new THREE.Raycaster();
  raycaster.far = 0.32; // occlusion radius: crevice/contact, not global
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3()).length();
  raycaster.far = Math.min(0.32, size * 0.45);
  // Deterministic cosine-ish hemisphere fan (golden spiral).
  const DIRS = [];
  const N = 20;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const phi = Math.acos(1 - t); // bias toward the pole (normal)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    DIRS.push(
      new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      ),
    );
  }
  const normalMat = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    if (!nor) continue;
    normalMat.getNormalMatrix(mesh.matrixWorld);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(nor, i).applyMatrix3(normalMat).normalize();
      q.setFromUnitVectors(up, n);
      let hits = 0;
      for (const d of DIRS) {
        dir.copy(d).applyQuaternion(q);
        raycaster.set(v.clone().addScaledVector(n, 0.004), dir);
        const hit = raycaster.intersectObjects(meshes, false);
        if (hit.length) hits++;
      }
      // Quantize to 16 levels — meshopt compresses the repeated bytes far
      // better and 1/16 steps are invisible under the 0.55 strength cap.
      const ao = Math.round((1 - 0.55 * (hits / DIRS.length)) * 15) / 15;
      colors[i * 3] = ao;
      colors[i * 3 + 1] = ao;
      colors[i * 3 + 2] = ao;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  const glb = await new Promise((res, rej) => {
    new GLTFExporter().parse(scene, res, rej, { binary: true });
  });
  fs.writeFileSync(aoFile, Buffer.from(glb));
}

async function buildModels({ bakeAo = false, only = null } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stacks-glb-"));
  let total = 0;
  let sharedTex = null;
  const selected = only
    ? MANIFEST.filter((spec) => only.has(spec.name))
    : MANIFEST;
  if (only && selected.length !== only.size) {
    const found = new Set(selected.map((spec) => spec.name));
    throw new Error(
      `unknown --only model(s): ${[...only].filter((name) => !found.has(name)).join(", ")}`,
    );
  }
  for (const spec of selected) {
    const raw = await download(spec.url, spec.name);
    if (spec.recolor) {
      const { json, bin } = parseGlb(raw);
      const png = extractImage(json, bin);
      if (!png)
        throw new Error(
          `${spec.name}: recolor requested but no embedded texture`,
        );
      // Every recolor prop must be the same tiny-treats atlas byte for byte
      // — one that quietly ships its own texture has to fail here rather
      // than render through someone else's UVs.
      const hash = crypto.createHash("sha1").update(png).digest("hex");
      if (sharedTex === null) {
        sharedTex = hash;
        await recolorTexture(spec, png);
      } else if (hash !== sharedTex) {
        throw new Error(
          `${spec.name}: texture differs from the ${RECOLOR_ATLAS} atlas`,
        );
      }
    }
    const cut = surgery(raw, spec);
    const pre = path.join(tmp, `${spec.name}.pre.glb`);
    const centered = path.join(tmp, `${spec.name}.center.glb`);
    const out = path.join(OUT, `${spec.name}.glb`);
    fs.writeFileSync(pre, cut);
    let source = pre;
    if (bakeAo && !spec.noAo) {
      const aoFile = path.join(tmp, `${spec.name}.ao.glb`);
      await aoBake(pre, aoFile);
      source = aoFile;
    }
    // Bottom-at-origin matches the shelf convention (local y=0 = contact).
    execFileSync(
      "npx",
      [
        "--yes",
        "@gltf-transform/cli",
        "center",
        source,
        centered,
        "--pivot",
        "below",
      ],
      { stdio: "pipe" },
    );
    // texMax: some props ship a texture wildly out of proportion to their
    // geometry. The microphone is 184 triangles carrying a 2048x2048 PNG that
    // holds 189 unique colours, all of them grey — 633 KB of shading map for a
    // prop that renders about 40 pixels tall. That one file would have been
    // 1.7x the entire /public/models budget. Resized before optimize, because
    // optimize's own texture handling is switched off here (no WebP: it writes
    // EXT_texture_webp into extensionsRequired and hard-fails other clients).
    let toOptimize = centered;
    if (spec.texMax) {
      const resized = path.join(tmp, `${spec.name}.resize.glb`);
      execFileSync(
        "npx",
        [
          "--yes",
          "@gltf-transform/cli",
          "resize",
          centered,
          resized,
          "--width",
          String(spec.texMax),
          "--height",
          String(spec.texMax),
        ],
        { stdio: "pipe" },
      );
      toOptimize = resized;
    }
    execFileSync(
      "npx",
      [
        "--yes",
        "@gltf-transform/cli",
        "optimize",
        toOptimize,
        out,
        "--compress",
        "meshopt",
        "--prune-attributes",
        "false",
        "--texture-compress",
        "false",
        ...(spec.simplify ? ["--simplify-error", String(spec.simplify)] : []),
      ],
      { stdio: "pipe" },
    );
    const size = fs.statSync(out).size;
    total += size;
    console.log(
      `${spec.name.padEnd(18)} ${(size / 1024).toFixed(1).padStart(6)} KB  (${spec.id}, raw ${(raw.length / 1024).toFixed(1)} KB)`,
    );
  }
  for (const f of [
    "atlas-dark.png",
    "atlas-light.png",
    `${RECOLOR_ATLAS}-dark.png`,
    `${RECOLOR_ATLAS}-light.png`,
  ]) {
    const p = path.join(OUT, f);
    if (fs.existsSync(p)) total += fs.statSync(p).size;
  }
  writeLicenses();
  console.log(
    `total (incl. themed atlases + recolor textures): ${(total / 1024).toFixed(1)} KB`,
  );
}

// ---- themed atlas generation (nearest-match remap of the shared palette
// atlas) ----
async function buildAtlases(mix) {
  fs.mkdirSync(OUT, { recursive: true });
  const { default: sharp } = await import("sharp");
  // The source atlas ships inside every CreativeTrio GLB — pull it from the
  // desk lamp download instead of committing a copy.
  const raw = await download(MANIFEST[0].url, MANIFEST[0].name);
  const { json, bin } = parseGlb(raw);
  const png = extractImage(json, bin);
  if (!png) throw new Error("no embedded atlas in source GLB");
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (const [theme, map] of Object.entries(THEMES)) {
    const out = remapPixels(
      data,
      info.channels,
      info.width * info.height,
      map,
      mix,
    );
    const file = path.join(OUT, `atlas-${theme}.png`);
    await sharp(out, { raw: info }).png({ palette: true }).toFile(file);
    console.log(
      `atlas-${theme}.png ${(fs.statSync(file).size / 1024).toFixed(2)} KB (mix ${mix})`,
    );
  }
}

// ---- inspection: front-plane vertex clusters (dial registration data) ----
async function inspect(name) {
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
  const [{ GLTFLoader, MeshoptDecoder }, THREE] = await Promise.all([
    import("three-stdlib"),
    import("three"),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(
    typeof MeshoptDecoder === "function" ? MeshoptDecoder() : MeshoptDecoder,
  );
  const buf = fs.readFileSync(path.join(OUT, `${name}.glb`));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const g = await new Promise((res, rej) => loader.parse(ab, "", res, rej));
  g.scene.updateMatrixWorld(true);
  const verts = [];
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      verts.push([v.x, v.y, v.z]);
    }
  });
  const bb = new THREE.Box3().setFromObject(g.scene);
  console.log(
    `${name} bbox min=(${bb.min.x.toFixed(4)},${bb.min.y.toFixed(4)},${bb.min.z.toFixed(4)}) max=(${bb.max.x.toFixed(4)},${bb.max.y.toFixed(4)},${bb.max.z.toFixed(4)})`,
  );
  const buckets = new Map();
  for (const [x, y, z] of verts) {
    const k = Math.round(z / 0.002);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push([x, y]);
  }
  for (const [k, pts] of [...buckets.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)) {
    let minX = 1e9,
      maxX = -1e9,
      minY = 1e9,
      maxY = -1e9;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    console.log(
      `z≈${(k * 0.002).toFixed(3)} n=${pts.length} center=(${((minX + maxX) / 2).toFixed(4)},${((minY + maxY) / 2).toFixed(4)}) rx=${((maxX - minX) / 2).toFixed(4)} ry=${((maxY - minY) / 2).toFixed(4)}`,
    );
  }
}

const args = process.argv.slice(2);
const atlasArg = args.indexOf("--atlas");
const inspectArg = args.indexOf("--inspect");
const onlyArg = args.indexOf("--only");
if (atlasArg !== -1) {
  await buildAtlases(Number(args[atlasArg + 1] ?? 1));
} else if (inspectArg !== -1) {
  await inspect(args[inspectArg + 1]);
} else {
  await buildModels({
    bakeAo: args.includes("--ao"),
    only:
      onlyArg === -1
        ? null
        : new Set(
            String(args[onlyArg + 1] ?? "")
              .split(",")
              .filter(Boolean),
          ),
  });
}
