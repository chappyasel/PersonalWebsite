import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const HOME_OG_MANIFEST = "public/images/stacks/home-og-scene.inputs.json";
export const HOME_OG_IMAGE = "public/images/stacks/home-og-scene.jpg";

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

/** @param {{ root: string }} options */
export async function writeHomeOgManifest({ root }) {
  const manifestPath = path.join(root, HOME_OG_MANIFEST);
  const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
  const manifest = {
    ...(await homeOgInputManifest({ root })),
    image: {
      path: HOME_OG_IMAGE,
      digest: await homeOgImageDigest({ root }),
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
