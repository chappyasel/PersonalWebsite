// Build review-only contact sheets for homepage source assets. This never
// writes to public/models: an externally sourced model must be approved before
// it enters the shipped manifest or the live scene.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const MODELS = path.join(ROOT, "public", "models");
const OUT = path.join(
  ROOT,
  "docs",
  "research",
  "assets",
  "2026-08-15-home-scene-approval",
);
const SOURCE_URL =
  "https://static.poly.pizza/b1d42c7e-152a-4d56-a754-cca000a5abad.glb";
const ADDITIONAL = [
  {
    name: "phone",
    url: "https://static.poly.pizza/eeb96574-1c13-426a-acb4-6a21d4b49a8e.glb",
  },
  {
    name: "notebook",
    url: "https://static.poly.pizza/d9b91830-403d-4f37-a2bc-45e99137afa9.glb",
  },
  {
    name: "harmonica",
    url: "https://static.poly.pizza/e8f94a73-e848-428d-b847-6a966f867ecd.glb",
  },
];

function parseGlb(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString("utf8"),
  );
  const binHeader = 20 + jsonLength;
  const binLength = buffer.readUInt32LE(binHeader);
  const bin = buffer.subarray(binHeader + 8, binHeader + 8 + binLength);
  return { json, bin };
}

function buildGlb(json, bin) {
  let jsonBuffer = Buffer.from(JSON.stringify(json));
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (bin.length % 4)) % 4;
  const paddedBin = Buffer.concat([bin, Buffer.alloc(binPadding)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuffer.length + 8 + paddedBin.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, paddedBin]);
}

function recolorSailboat(source, destination) {
  const { json, bin } = parseGlb(fs.readFileSync(source));
  const colors = {
    Sail: [0.94, 0.93, 0.87, 1],
    LightWood: [0.47, 0.22, 0.1, 1],
    DarkWood: [0.23, 0.1, 0.045, 1],
    Steel: [0.08, 0.18, 0.28, 1],
  };
  for (const material of json.materials ?? []) {
    const color = colors[material.name];
    if (!color) continue;
    material.pbrMetallicRoughness ??= {};
    material.pbrMetallicRoughness.baseColorFactor = color;
    material.pbrMetallicRoughness.metallicFactor =
      material.name === "Steel" ? 0.28 : 0;
    material.pbrMetallicRoughness.roughnessFactor =
      material.name === "Sail" ? 0.84 : 0.68;
  }
  fs.writeFileSync(destination, buildGlb(json, bin));
}

function render(name, file) {
  const link = path.join(MODELS, `${name}.glb`);
  if (fs.existsSync(link)) {
    throw new Error(`Refusing to replace existing ${link}`);
  }
  fs.symlinkSync(file, link);
  try {
    execFileSync(
      "node",
      [
        "scripts/stacks-render.mjs",
        name,
        "--yaws",
        "0,90,180",
        "--pitch",
        "0.08",
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
  } finally {
    fs.unlinkSync(link);
  }
  return path.join(os.tmpdir(), "stacks-render", `${name}.png`);
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "stacks-approval-"));
  const source = path.join(temp, "sailboat-source.glb");
  const ready = path.join(temp, "sailboat-scene-ready.glb");
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  fs.writeFileSync(source, Buffer.from(await response.arrayBuffer()));
  recolorSailboat(source, ready);

  fs.mkdirSync(OUT, { recursive: true });
  const sourcePng = render("approval-sailboat-source", source);
  const readyPng = render("approval-sailboat-ready", ready);
  await sharp(sourcePng)
    .png()
    .toFile(path.join(OUT, "sailboat-source-angles.png"));
  await sharp(readyPng)
    .png()
    .toFile(path.join(OUT, "sailboat-scene-ready-angles.png"));

  const resized = await sharp(readyPng)
    .resize({ width: 840 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < resized.data.length; i += 4) {
    if (
      resized.data[i] > 250 &&
      resized.data[i + 1] > 250 &&
      resized.data[i + 2] > 250
    ) {
      resized.data[i + 3] = 0;
    }
  }
  const strip = await sharp(resized.data, {
    raw: { ...resized.info, channels: 4 },
  })
    .png()
    .toBuffer();
  const light = await sharp({
    create: { width: 900, height: 330, channels: 3, background: "#b9c8c2" },
  })
    .composite([{ input: strip, left: 30, top: 60 }])
    .png()
    .toBuffer();
  const dark = await sharp({
    create: { width: 900, height: 330, channels: 3, background: "#17212b" },
  })
    .composite([{ input: strip, left: 30, top: 60 }])
    .png()
    .toBuffer();
  await sharp({
    create: { width: 900, height: 660, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: light, left: 0, top: 0 },
      { input: dark, left: 0, top: 330 },
    ])
    .png()
    .toFile(path.join(OUT, "sailboat-light-dark-context.png"));
  const broadside = await sharp(strip)
    .extract({ left: 280, top: 0, width: 280, height: 210 })
    .png()
    .toBuffer();
  const mobileLight = await sharp({
    create: { width: 390, height: 422, channels: 3, background: "#b9c8c2" },
  })
    .composite([{ input: broadside, left: 55, top: 145 }])
    .png()
    .toBuffer();
  const mobileDark = await sharp({
    create: { width: 390, height: 422, channels: 3, background: "#17212b" },
  })
    .composite([{ input: broadside, left: 55, top: 145 }])
    .png()
    .toBuffer();
  await sharp({
    create: { width: 390, height: 844, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: mobileLight, left: 0, top: 0 },
      { input: mobileDark, left: 0, top: 422 },
    ])
    .png()
    .toFile(path.join(OUT, "sailboat-mobile-context.png"));

  for (const candidate of ADDITIONAL) {
    const sourceFile = path.join(temp, `${candidate.name}-source.glb`);
    const sourceResponse = await fetch(candidate.url);
    if (!sourceResponse.ok)
      throw new Error(
        `${candidate.name} download failed: ${sourceResponse.status}`,
      );
    fs.writeFileSync(
      sourceFile,
      Buffer.from(await sourceResponse.arrayBuffer()),
    );
    const sourceAngles = render(
      `approval-${candidate.name}-source`,
      sourceFile,
    );
    const readyAngles = render(
      `approval-${candidate.name}-ready`,
      path.join(MODELS, `${candidate.name}.glb`),
    );
    await sharp(sourceAngles)
      .png()
      .toFile(path.join(OUT, `${candidate.name}-source-angles.png`));
    await sharp(readyAngles)
      .png()
      .toFile(path.join(OUT, `${candidate.name}-scene-ready-angles.png`));
  }
  console.log(`Approval renders written to ${OUT}`);
}

await main();
