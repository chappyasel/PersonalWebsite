import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";

import { READBACK_PROVENANCE, verifyQualityCase } from "./verify-inputs.mjs";

const hash = (v) => createHash("sha256").update(v).digest("hex");
const input = "scripts/generate/room-artwork-inputs";
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "quality-input-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const key = "projects/light-desktop";
  const write = async (file, bytes) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), bytes);
  };
  const contract = {
    unit: "projects",
    case: "light-desktop",
    owners: [
      { id: "shelf", meshCount: 1, paths: ["shelf"] },
      { id: "prop", meshCount: 1, paths: ["prop"] },
    ],
  };
  const contractBytes = JSON.stringify(contract) + "\n";
  await write(`${input}/${key}/capture.json`, contractBytes);
  const template = '<svg><g data-part="shelf"/><g data-part="prop"/></svg>';
  await write("approved.svg", template);
  const spec = {
    contractSha256: hash(contractBytes),
    approvedSvg: { file: "approved.svg", sha256: hash(template) },
    owners: [
      { id: "shelf", details: [false], box: [0, 0, 3, 3] },
      { id: "prop", details: [true], box: [0, 0, 3, 3] },
    ],
    qualityInput: { file: `${input}/quality/${key}/capture.json`, sha256: "" },
  };
  const capture = {
    version: 1,
    scale: 4,
    readback: READBACK_PROVENANCE,
    contractSha256: hash(JSON.stringify(contract)),
    errors: [],
    files: {},
    owners: [
      {
        id: "prop",
        scale: 4,
        box: [0, 0, 3, 3],
        detailPrepared: true,
        images: {
          mask: "mask.png",
          colour: "colour.png",
          detail: "detail.png",
        },
      },
    ],
  };
  const image = async (
    kind,
    { width = kind === "detail" ? 6 : 12, border = false } = {},
  ) => {
    const pixels = Buffer.alloc(width * width * 4);
    const i =
      (border ? 0 : Math.floor(width / 2) * width + Math.floor(width / 2)) * 4;
    pixels[i] = 120;
    pixels[i + 3] = border ? 1 : 255;
    const bytes = await sharp(pixels, {
      raw: { width, height: width, channels: 4 },
    })
      .png()
      .toBuffer();
    await write(`${input}/quality/${key}/${kind}.png`, bytes);
    capture.files[`${kind}.png`] = hash(bytes);
  };
  for (const kind of ["mask", "colour", "detail"]) await image(kind);
  const save = async () => {
    const bytes = JSON.stringify(capture);
    await write(spec.qualityInput.file, bytes);
    spec.qualityInput.sha256 = hash(bytes);
  };
  await save();
  return { root, key, spec, capture, image, save, write };
}
test("accepts fixed contract, template and decoded 4x masks with prepared 2x detail", async (t) => {
  const f = await fixture(t);
  const result = await verifyQualityCase(f.root, f.key, f.spec);
  assert.equal(result.owners, 1);
  assert.equal(result.imageCount, 3);
});
test("rejects altered source dimensions even after refreshing image and JSON checksums", async (t) => {
  const f = await fixture(t);
  await f.image("mask", { width: 8 });
  await f.save();
  await assert.rejects(
    verifyQualityCase(f.root, f.key, f.spec),
    /dimensions mismatch/,
  );
});
test("rejects alpha1 at crop border, below the trace threshold", async (t) => {
  const f = await fixture(t);
  await f.image("mask", { border: true });
  await f.save();
  await assert.rejects(
    verifyQualityCase(f.root, f.key, f.spec),
    /nonzero alpha touches crop boundary/,
  );
});
test("rejects missing readback provenance and mismatched detail inventory", async (t) => {
  const f = await fixture(t);
  delete f.capture.readback;
  await f.save();
  await assert.rejects(
    verifyQualityCase(f.root, f.key, f.spec),
    /readback provenance/,
  );
  f.capture.readback = READBACK_PROVENANCE;
  await f.save();
  f.spec.owners[1].details = [];
  await assert.rejects(
    verifyQualityCase(f.root, f.key, f.spec),
    /mesh\/detail count mismatch/,
  );
});
test("rejects modified template, JSON and image bytes without accepting a partial verification", async (t) => {
  const f = await fixture(t);
  await f.write("approved.svg", "<svg/>");
  await assert.rejects(
    verifyQualityCase(f.root, f.key, f.spec),
    /template checksum/,
  );
  f.spec.approvedSvg.sha256 = hash("<svg/>");
  f.spec.qualityInput.sha256 = "changed";
  await assert.rejects(
    verifyQualityCase(f.root, f.key, f.spec),
    /capture checksum/,
  );
  await f.save();
  await f.write(`${input}/quality/${f.key}/mask.png`, "changed");
  await assert.rejects(
    verifyQualityCase(f.root, f.key, f.spec),
    /image checksum/,
  );
});

test("permits an explicit 4x prepared detail exception without changing mask dimensions", async (t) => {
  const f = await fixture(t);
  await f.image("detail", { width: 12 });
  await f.save();
  await assert.rejects(
    verifyQualityCase(f.root, f.key, f.spec),
    /dimensions mismatch/,
  );
  f.spec.owners[1].detailScale = 4;
  assert.equal((await verifyQualityCase(f.root, f.key, f.spec)).imageCount, 3);
  await f.image("mask", { width: 6 });
  await f.save();
  await assert.rejects(
    verifyQualityCase(f.root, f.key, f.spec),
    /dimensions mismatch/,
  );
});
