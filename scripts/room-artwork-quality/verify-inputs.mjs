import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * @typedef {{id:string, details:boolean[], box:[number,number,number,number], detailScale?:number}} QualityOwnerSpec
 * @typedef {{contractSha256:string, approvedSvg:{file:string,sha256:string}, qualityInput:{file:string,sha256:string}, owners:QualityOwnerSpec[]}} QualitySpec
 * @typedef {{unit:string, case:string, owners:{id:string,meshCount:number,paths:string[]}[]}} CapturedContract
 * @typedef {{version:number,scale:number,readback:string,contractSha256:string,errors:unknown[],files:Record<string,string>,owners:{id:string,scale:number,box:[number,number,number,number],detailPrepared?:boolean,images:Record<string,string>}[]}} QualityCapture
 */
const INPUT = "scripts/generate/room-artwork-inputs";
export const READBACK_PROVENANCE =
  "bottom-up premultiplied RGBA explicitly unpremultiplied before Canvas ImageData (archive capture.ts contract)";
/** @param {string | Uint8Array} bytes */
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** @param {unknown} a @param {unknown} b */
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function requireValue(condition, message) {
  if (!condition) throw Error(message);
}
/** @param {readonly unknown[]} items */
const unique = (items) => new Set(items).size === items.length;
/** @param {string} root @param {string} file */
function localFile(root, file) {
  const resolved = path.resolve(root, file);
  requireValue(
    resolved.startsWith(path.resolve(root) + path.sep),
    `Input path escapes root: ${file}`,
  );
  return resolved;
}

/**
 * Offline verification only. The immutable contract remains the source of identity.
 * @param {string} root
 * @param {string} key
 * @param {QualitySpec} spec
 */
export async function verifyQualityCase(root, key, spec) {
  const [unit, label] = key.split("/");
  requireValue(
    unit && label && key.split("/").length === 2,
    "Invalid quality case",
  );
  const contractBytes = await readFile(
    localFile(root, `${INPUT}/${key}/capture.json`),
  );
  requireValue(
    sha(contractBytes) === spec.contractSha256,
    `${key}: contract checksum mismatch`,
  );
  /** @type {CapturedContract} */
  const contract = JSON.parse(contractBytes.toString("utf8"));
  requireValue(
    contract.unit === unit && contract.case === label,
    `${key}: contract case mismatch`,
  );
  requireValue(
    spec.approvedSvg?.file && spec.approvedSvg?.sha256,
    `${key}: missing approved template receipt`,
  );
  const template = await readFile(localFile(root, spec.approvedSvg.file));
  requireValue(
    sha(template) === spec.approvedSvg.sha256,
    `${key}: template checksum mismatch`,
  );
  requireValue(
    spec.qualityInput?.file === `${INPUT}/quality/${key}/capture.json`,
    `${key}: missing frozen quality input`,
  );
  const bytes = await readFile(localFile(root, spec.qualityInput.file));
  requireValue(
    sha(bytes) === spec.qualityInput.sha256,
    `${key}: capture checksum mismatch`,
  );
  /** @type {QualityCapture} */
  const capture = JSON.parse(bytes.toString("utf8"));
  requireValue(
    capture.version === 1 && capture.scale === 4,
    `${key}: expected 4x capture`,
  );
  requireValue(
    capture.readback === READBACK_PROVENANCE,
    `${key}: missing or unsupported readback provenance`,
  );
  requireValue(
    capture.contractSha256 === sha(JSON.stringify(contract)),
    `${key}: capture contract identity mismatch`,
  );
  requireValue(
    Array.isArray(capture.errors) && capture.errors.length === 0,
    `${key}: capture reported errors`,
  );
  const contractIds = contract.owners.map((owner) => owner.id),
    specIds = spec.owners.map((owner) => owner.id);
  requireValue(
    unique(contractIds) && unique(specIds) && equal(contractIds, specIds),
    `${key}: owner inventory mismatch`,
  );
  for (const [i, owner] of contract.owners.entries()) {
    const item = /** @type {QualityOwnerSpec} */ (spec.owners[i]);
    requireValue(
      owner.meshCount === owner.paths.length &&
        item.details.length === owner.paths.length &&
        item.details.every((v) => typeof v === "boolean"),
      `${key}/${owner.id}: mesh/detail count mismatch`,
    );
    requireValue(
      item.box.length === 4 &&
        item.box.every(Number.isInteger) &&
        item.box[2] > 0 &&
        item.box[3] > 0,
      `${key}/${owner.id}: invalid crop`,
    );
  }
  const expectedIds = contractIds.filter((id) => id !== "shelf");
  requireValue(
    equal(
      capture.owners.map((owner) => owner.id),
      expectedIds,
    ),
    `${key}: captured owners differ`,
  );
  requireValue(
    capture.files && typeof capture.files === "object",
    `${key}: missing file checksums`,
  );
  const used = new Set();
  let imageCount = 0,
    imageBytes = 0,
    maskPixels = 0;
  for (const owner of capture.owners) {
    const item = /** @type {QualityOwnerSpec} */ (
      spec.owners.find((candidate) => candidate.id === owner.id)
    );
    requireValue(
      owner.scale === 4 && equal(owner.box, item.box),
      `${key}/${owner.id}: capture crop or scale changed`,
    );
    const expectedKinds = item.details.some(Boolean)
      ? ["colour", "detail", "mask"]
      : ["colour", "mask"];
    requireValue(
      equal(Object.keys(owner.images).sort(), expectedKinds),
      `${key}/${owner.id}: detail image classification mismatch`,
    );
    for (const [kind, file] of Object.entries(owner.images)) {
      requireValue(
        path.basename(file) === file && !used.has(file),
        `${key}: duplicate or unsafe image path`,
      );
      used.add(file);
      const image = await readFile(
        localFile(root, `${INPUT}/quality/${key}/${file}`),
      );
      requireValue(
        sha(image) === capture.files[file],
        `${key}/${file}: image checksum mismatch`,
      );
      const { data, info } = await sharp(image)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const preparedDetailScale =
        item.detailScale ?? (label.endsWith("phone") ? 3 : 2);
      requireValue(
        [2, 3, 4].includes(preparedDetailScale),
        `${key}/${owner.id}: unsupported detail scale`,
      );
      const scale =
        kind === "detail" && owner.detailPrepared ? preparedDetailScale : 4;
      requireValue(
        info.width === item.box[2] * scale &&
          info.height === item.box[3] * scale,
        `${key}/${file}: image dimensions mismatch`,
      );
      if (kind === "mask") {
        let opaque = 0;
        for (let y = 0; y < info.height; y++)
          for (let x = 0; x < info.width; x++) {
            const alpha = data[(y * info.width + x) * 4 + 3];
            if (!alpha) continue;
            requireValue(
              x > 0 && y > 0 && x < info.width - 1 && y < info.height - 1,
              `${key}/${file}: nonzero alpha touches crop boundary`,
            );
            opaque++;
          }
        requireValue(opaque > 0, `${key}/${file}: empty owner mask`);
        maskPixels += opaque;
      }
      imageCount++;
      imageBytes += image.length;
    }
  }
  requireValue(
    equal([...used].sort(), Object.keys(capture.files).sort()),
    `${key}: unreferenced or missing image checksums`,
  );
  return {
    key,
    owners: capture.owners.length,
    imageCount,
    imageBytes,
    maskPixels,
    readback: capture.readback,
  };
}

/** @param {string} root */
export async function verifyQualityInputs(root = process.cwd()) {
  /** @type {{cases:Record<string,QualitySpec>}} */
  const specs = JSON.parse(
    await readFile(
      localFile(root, "scripts/room-artwork-quality/capture-specs.json"),
      "utf8",
    ),
  );
  /** @type {{cases:{unit:string,label:string}[]}} */
  const manifest = JSON.parse(
    await readFile(localFile(root, `${INPUT}/manifest.json`), "utf8"),
  );
  const expected = manifest.cases
    .map((entry) => `${entry.unit}/${entry.label}`)
    .sort();
  requireValue(
    equal(Object.keys(specs.cases).sort(), expected),
    "Quality case inventory mismatch",
  );
  const results = [];
  for (const key of expected)
    results.push(
      await verifyQualityCase(
        root,
        key,
        /** @type {QualitySpec} */ (specs.cases[key]),
      ),
    );
  return {
    cases: results.length,
    owners: results.reduce((n, value) => n + value.owners, 0),
    imageBytes: results.reduce((n, value) => n + value.imageBytes, 0),
    results,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(await verifyQualityInputs(), null, 2));
