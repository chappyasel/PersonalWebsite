import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const input = "scripts/generate/room-artwork-inputs";
const source = process.argv[2] ?? "/tmp/room-artwork-quality-captures";
const manifest = JSON.parse(await readFile(`${input}/manifest.json`, "utf8"));
const specs = JSON.parse(
  await readFile("scripts/room-artwork-quality/capture-specs.json", "utf8"),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
for (const c of manifest.cases) {
  if (!c.qualityReprocessing) continue;
  const key = `${c.unit}/${c.label}`,
    folder = `${input}/quality/${key}`;
  await mkdir(folder, { recursive: true });
  const capture = JSON.parse(
    await readFile(`${source}/${key}/capture.json`, "utf8"),
  );
  capture.files = {};
  for (const owner of capture.owners) {
    for (const kind of ["mask", "colour"]) {
      const file = owner.images[kind];
      const bytes = await sharp(`${source}/${key}/${file}`)
        .png({ compressionLevel: 9 })
        .toBuffer();
      await writeFile(`${folder}/${file}`, bytes);
      capture.files[file] = sha(bytes);
    }
    if (owner.images.detail) {
      const d = c.details.find((d) => d.href.endsWith(`/${owner.id}.webp`));
      if (!d) throw Error("Missing prepared detail");
      const bytes = await readFile(`${input}/${d.file}`);
      const file = `${owner.id}.detail.webp`;
      await writeFile(`${folder}/${file}`, bytes);
      owner.images.detail = file;
      capture.files[file] = sha(bytes);
      owner.detailPrepared = true;
    }
    owner.textures = owner.textures.map((t) => ({
      ...t,
      src: t.src ? new URL(t.src).pathname : null,
    }));
  }
  const bytes = Buffer.from(JSON.stringify(capture, null, 2) + "\n");
  await writeFile(`${folder}/capture.json`, bytes);
  specs.cases[key].qualityInput = {
    file: `${input}/quality/${key}/capture.json`,
    sha256: sha(bytes),
  };
  const approved = `scripts/room-artwork-quality/approved/${c.unit}-${c.label}.svg`;
  specs.cases[key].approvedSvg = {
    file: approved,
    sha256: sha(await readFile(approved)),
    sourceRevision: "27c0155",
  };
}
await writeFile(
  "scripts/room-artwork-quality/capture-specs.json",
  JSON.stringify(specs, null, 2) + "\n",
);
