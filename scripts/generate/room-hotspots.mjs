// Reuse the frozen artwork's object bounds. No renderer or browser required.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(
  await readFile(
    "src/app/components/stacks/illustration/artwork/catalog.json",
    "utf8",
  ),
);
const result = {};
for (const [key, artwork] of Object.entries(catalog)) {
  const svg = await readFile(`public${artwork.src}`, "utf8");
  const capture = JSON.parse(
    await readFile(
      `scripts/generate/room-artwork-inputs/quality/${artwork.unit}/${artwork.theme}-${artwork.viewport}/capture.json`,
      "utf8",
    ),
  );
  const boxes = new Map(capture.owners.map(({ id, box }) => [id, box]));
  result[key] = {
    artworkSha256: createHash("sha256").update(svg).digest("hex"),
    // Retain paint order so foreground targets win when bounds overlap.
    parts: [...svg.matchAll(/<g data-part="([^"]+)"/g)].flatMap(([, id]) => {
      if (id === "shelf") return [];
      const box = boxes.get(id);
      if (!box) throw Error(`Missing artwork bounds: ${key}/${id}`);
      return [{ id, box }];
    }),
  };
}
const target =
  "src/app/components/stacks/illustration/artwork/hotspots.generated.json";
const output = `${JSON.stringify(result)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== output)
    throw Error(
      "Room hotspot bounds are stale. Run node scripts/generate/room-hotspots.mjs",
    );
} else await writeFile(target, output);
