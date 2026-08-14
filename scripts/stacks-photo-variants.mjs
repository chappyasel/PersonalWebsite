// Generate right-sized runtime variants from the canonical v8 scene photos.
// The masters remain untouched for future re-crops and hero use; the room
// itself loads only these role-sized assets.
//
//   node scripts/stacks-photo-variants.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(process.cwd(), "public", "images", "stacks", "v8");
const EDGES = [256, 512];
const masters = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".webp"))
  .map((entry) => entry.name)
  .sort();

let masterPixels = 0;
let variantPixels = 0;
let variantBytes = 0;

for (const filename of masters) {
  const source = path.join(ROOT, filename);
  const metadata = await sharp(source).metadata();
  masterPixels += (metadata.width ?? 0) * (metadata.height ?? 0);

  for (const edge of EDGES) {
    const outputDir = path.join(ROOT, String(edge));
    const output = path.join(outputDir, filename);
    fs.mkdirSync(outputDir, { recursive: true });
    const result = await sharp(source)
      .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: edge === 512 ? 84 : 80, effort: 6 })
      .toFile(output);
    variantPixels += result.width * result.height;
    variantBytes += result.size;
  }
}

console.log(
  `${masters.length} masters: ${(masterPixels / 1_000_000).toFixed(2)} MP`,
);
console.log(
  `${masters.length * EDGES.length} variants: ${(variantPixels / 1_000_000).toFixed(2)} MP, ${(variantBytes / 1024).toFixed(1)} KiB`,
);
