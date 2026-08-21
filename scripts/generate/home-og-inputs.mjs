import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const HOME_OG_MANIFEST =
  "public/images/stacks/home-og-scene.inputs.json";
export const HOME_OG_IMAGE = "public/images/stacks/home-og-scene.jpg";
const HOME_OG_PROVENANCE_PREFIX = "\nSTACKS_HOME_OG_INPUT_SHA256=";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const INPUT_PATHS = Object.freeze([
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/components/stacks",
  "src/components/ui",
  "src/styles",
  "scripts/generate/home-og-scene.mjs",
  "scripts/generate/home-og-scene-config.mjs",
  "scripts/generate/home-og-inputs.mjs",
  "public/data",
  "public/models",
  "public/images/about",
  "public/images/projects",
  "public/images/stacks",
]);

const EXCLUDED_INPUTS = new Set([HOME_OG_IMAGE, HOME_OG_MANIFEST]);

/** @param {string} file */
const isNonVisualSource = (file) =>
  file.endsWith(".md") ||
  file.endsWith(".test.ts") ||
  file.endsWith(".test.tsx");

/** @param {string} root */
async function listInputs(root) {
  const { stdout } = await execFileAsync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...INPUT_PATHS,
    ],
    { cwd: root, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );

  return stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => !EXCLUDED_INPUTS.has(file))
    .filter((file) => !isNonVisualSource(file))
    .sort();
}

/** @param {{ root: string }} options */
export async function homeOgInputManifest({ root }) {
  const files = await listInputs(root);
  const hash = createHash("sha256");

  for (const file of files) {
    const content = await readFile(path.join(root, file));
    hash.update(file);
    hash.update("\0");
    hash.update(String(content.byteLength));
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }

  return {
    version: 1,
    algorithm: "sha256",
    digest: hash.digest("hex"),
    files,
  };
}

/** @param {{ root: string }} options */
export async function homeOgImageDigest({ root }) {
  const image = await readFile(path.join(root, HOME_OG_IMAGE));
  return createHash("sha256").update(image).digest("hex");
}

/** Read the visual-input digest embedded in the JPEG itself. Keeping this
 * provenance inside the generated artifact prevents a manifest-only refresh
 * from blessing an image captured from older scene code.
 * @param {{ root: string }} options
 */
export async function homeOgImageInputDigest({ root }) {
  const image = await readFile(path.join(root, HOME_OG_IMAGE));
  const marker = Buffer.from(HOME_OG_PROVENANCE_PREFIX);
  const markerAt = image.lastIndexOf(marker);
  if (markerAt === -1) return null;
  const digestAt = markerAt + marker.length;
  const digest = image.subarray(digestAt, digestAt + 64).toString("ascii");
  return SHA256_PATTERN.test(digest) ? digest : null;
}

/** Stamp a completed capture before it replaces the committed JPEG. JPEG
 * readers permit trailing application data, so the pixels remain unchanged
 * while the artifact carries independently checkable capture provenance.
 * @param {{ imagePath: string, inputDigest: string }} options
 */
export async function stampHomeOgImage({ imagePath, inputDigest }) {
  if (!SHA256_PATTERN.test(inputDigest)) {
    throw new Error("Homepage OG input digest must be a SHA-256 hex string.");
  }
  const image = await readFile(imagePath);
  const marker = Buffer.from(HOME_OG_PROVENANCE_PREFIX);
  const previousMarkerAt = image.lastIndexOf(marker);
  const unstamped =
    previousMarkerAt === -1 ? image : image.subarray(0, previousMarkerAt);
  await writeFile(
    imagePath,
    Buffer.concat([
      unstamped,
      Buffer.from(`${HOME_OG_PROVENANCE_PREFIX}${inputDigest}\n`),
    ]),
  );
}

/** @param {{ root: string }} options */
export async function writeHomeOgManifest({ root }) {
  const manifestPath = path.join(root, HOME_OG_MANIFEST);
  const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
  const inputs = await homeOgInputManifest({ root });
  const capturedInputDigest = await homeOgImageInputDigest({ root });
  if (capturedInputDigest !== inputs.digest) {
    throw new Error(
      "Regenerate the homepage OG image; the current JPEG was not captured from these visual inputs.",
    );
  }
  const manifest = {
    ...inputs,
    image: {
      path: HOME_OG_IMAGE,
      digest: await homeOgImageDigest({ root }),
      inputDigest: capturedInputDigest,
    },
  };

  await mkdir(path.dirname(manifestPath), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(temporaryPath, manifestPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  return manifest;
}
