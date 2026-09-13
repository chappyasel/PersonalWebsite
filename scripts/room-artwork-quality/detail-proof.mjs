import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const output = "docs/reviews/room-artwork-quality-evidence";
await mkdir(output, { recursive: true });
const proofs = [
  ["projects", "grab-photo-projects-wwdc-v8"],
  ["projects", "mac"],
  ["talks", "grab-photo-talk-demo-night-v8"],
];
const results = [];
for (const [unit, id] of proofs) {
  const folder = `/tmp/room-artwork-quality-captures/${unit}/light-desktop`;
  const capture = JSON.parse(await readFile(`${folder}/capture.json`, "utf8"));
  const owner = capture.owners.find((o) => o.id === id);
  const [, , width, height] = owner.box;
  const variants = [];
  for (const density of [2, 4]) {
    const bytes = await sharp(`${folder}/${id}.detail.png`)
      .resize(width * density, height * density)
      .webp({ quality: 92, alphaQuality: 100, effort: 6 })
      .toBuffer();
    const viewed = await sharp(bytes)
      .resize(width * 2, height * 2)
      .png()
      .toBuffer();
    variants.push({ density, bytes: bytes.length, viewed });
  }
  const board = await sharp({
    create: {
      width: width * 4,
      height: height * 2,
      channels: 4,
      background: "#d9dfd3",
    },
  })
    .composite(
      variants.map((v, i) => ({
        input: v.viewed,
        left: i * width * 2,
        top: 0,
      })),
    )
    .png()
    .toBuffer();
  await writeFile(`${output}/${unit}-${id}-detail-2x-vs-4x.png`, board);
  results.push({
    unit,
    id,
    displayDensity: 2,
    quality: 92,
    variants: variants.map(({ density, bytes }) => ({ density, bytes })),
  });
}
await writeFile(
  `${output}/detail-density-comparison.json`,
  JSON.stringify(results, null, 2) + "\n",
);
console.log(results);
