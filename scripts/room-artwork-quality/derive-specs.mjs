// One-time extraction from archived raw evidence. Recapture does not need the archive.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const archive = process.argv[2];
if (!archive) throw Error("Pass the read-only archive checkout root");
const input = "scripts/generate/room-artwork-inputs";
const manifest = JSON.parse(await readFile(`${input}/manifest.json`, "utf8"));
const cases = {};
const sha = (b) => createHash("sha256").update(b).digest("hex");
for (const entry of manifest.cases) {
  const bytes = await readFile(`${input}/${entry.inputCapture}`);
  const contract = JSON.parse(bytes);
  const rawBytes = await readFile(path.join(archive, contract.rawCapture.path));
  const raw = JSON.parse(rawBytes);
  const owners = [];
  for (const owner of contract.owners) {
    const part = raw.parts.find((p) => p.id === owner.id);
    if (!part) throw Error("No raw owner " + owner.id);
    const { data, info } = await sharp(Buffer.from(part.mask, "base64"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minX = info.width,
      minY = info.height,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * 4 + 3] >= 128) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
    const details = raw.inventory
      .filter((p) => p.owner === owner.id)
      .map((p) => p.detail);
    if (details.length !== owner.meshCount)
      throw Error("Inventory mismatch " + owner.id);
    owners.push({
      id: owner.id,
      treatment:
        part.treatment ??
        {
          lamp: "silhouette",
          "shimmer-apple": "metal",
          trophy: "trophy",
          card: "card",
        }[owner.id] ??
        "natural",
      box: [minX - 3, minY - 3, maxX - minX + 7, maxY - minY + 7],
      details,
    });
  }
  for (const owner of owners)
    if (owner.id === "grab-lighthouse-musings") {
      const [x, y, w, h] = owner.box;
      owner.box = [x - 16, y - 16, w + 32, h + 32];
      owner.cropPaddingException =
        "Additional16 source pixels reveal thin mounted finial/rails missed by original low-resolution alpha; final fresh-mask gate still applies.";
    }
  const approved = `scripts/room-artwork-quality/approved/${entry.unit}-${entry.label}.svg`;
  cases[`${entry.unit}/${entry.label}`] = {
    approvedSvg: {
      file: approved,
      sha256: entry.svgSha256,
      sourceRevision: "27c0155",
    },
    approvedDetails: entry.details,
    contractSha256: sha(bytes),
    derivation: {
      archiveRevision: "e0becc7d4c4ff87595683ccf85191ee76ff04595",
      rawPath: contract.rawCapture.path,
      rawSha256: sha(rawBytes),
      rule: "Alpha>=128 bounds plus3 source pixels; treatment/detail flags copied in immutable owner path order; no transforms reconstructed",
    },
    owners,
  };
}
await writeFile(
  "scripts/room-artwork-quality/capture-specs.json",
  JSON.stringify({ version: 1, cases }, null, 2) + "\n",
);
console.log("Derived", Object.keys(cases).length, "specifications");
