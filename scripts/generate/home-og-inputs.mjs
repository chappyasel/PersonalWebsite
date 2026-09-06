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
  "public/models",
  "public/images/about",
  "public/images/stacks",
]);

const EXCLUDED_INPUTS = new Set([HOME_OG_IMAGE, HOME_OG_MANIFEST]);

/** The social card is a fixed, head-on capture of the About shelf. Keep its
 * fingerprint tied to that frame rather than to every off-camera Unit that
 * happens to share the homepage bundle. Shared scene and rendering sources
 * remain watched; only Unit-local sources and assets are narrowed here. */
const ABOUT_UNIT_INPUTS = new Set([
  "src/app/components/stacks/scene/units/ShelfSucculent.tsx",
  "src/app/components/stacks/scene/units/UnitAbout.tsx",
  "src/app/components/stacks/scene/units/aboutReadingStack.ts",
  "src/app/components/stacks/scene/units/featuredBookGeometry.ts",
  "src/app/components/stacks/scene/units/types.ts",
  "src/app/components/stacks/scene/units/unitShelfLayout.ts",
]);

/** The card is screenshot mode's still (home-og-scene-config.mjs), which
 * renders neither the couch nor the seam monstera, so `couch.glb` and
 * `potted-plant.glb` are not inputs. The Projects Macintosh the mode would
 * stand in the portrait's place is not in it either: the capture keeps the
 * portrait, so UnitProjects.tsx stays a Unit-local source of another shelf. */
const ABOUT_MODEL_INPUTS = new Set(
  [
    "cactus.glb",
    "desk-lamp.glb",
    "dumbbell.glb",
    "globe.glb",
    "succulent-pot.glb",
  ].map((file) => `public/models/${file}`),
);

const ABOUT_STACK_IMAGE_INPUTS = new Set([
  "public/images/stacks/grass-tuft-alpha.webp",
  "public/images/stacks/tj-medallion.jpg",
]);

const OFF_CAMERA_SCENE_INPUTS = new Set([
  "src/app/components/stacks/scene/InsectPerchDiagnostics.tsx",
  "src/app/components/stacks/scene/lighthouseBeaconDiagnostics.ts",
  "src/app/components/stacks/scene/musingsShelfGeometry.ts",
  "src/app/components/stacks/scene/sceneDiagnosticsRegistry.ts",
]);

/** Surfaces the capture removes outright rather than merely hiding.
 *
 * StacksHome sets `display: none` on `.stacks-boot` and `.stacks-flat` under
 * `html[data-og-capture]`, so neither contributes a pixel or a layout box to
 * the card, and a file whose only job is to render one of them cannot change
 * what is captured. This is deliberately narrower than "hidden": the rest of
 * the homepage chrome is `visibility: hidden`, which still occupies layout —
 * and the rail's measured width feeds the camera's About stop, so UnitRail
 * stays watched.
 *
 * `home-og-scene.mjs` asserts both selectors compute to `display: none` at
 * capture time, so this list fails loudly instead of silently rotting.
 *
 * `boot/aboutBootStage.ts` is here on a different footing. It renders nothing;
 * it writes `data-boot-stage` and the `--stacks-boot-stage-*` properties onto
 * documentElement, which capture mode does NOT remove, and it has a live
 * importer in UnitRail, which stays watched. What makes it inert for the card
 * is that everything it writes is read only inside `.stacks-boot`, so the
 * capture asserts that separately by scanning the stylesheet. */
const CAPTURE_REMOVED_INPUTS = new Set([
  "src/app/components/stacks/FlatHome.tsx",
  "src/app/components/stacks/boot/aboutBootStage.ts",
  "src/app/components/stacks/dom/BootScreen.tsx",
  "src/app/components/stacks/dom/bootReadingBooks.ts",
  "src/app/components/stacks/dom/bootVignette.ts",
]);

/** @param {string} file */
function belongsToAboutCapture(file) {
  if (CAPTURE_REMOVED_INPUTS.has(file)) return false;
  if (file.startsWith("src/app/components/stacks/scene/units/"))
    return ABOUT_UNIT_INPUTS.has(file);
  if (file.startsWith("public/models/")) return ABOUT_MODEL_INPUTS.has(file);
  if (file.startsWith("public/images/stacks/v8/"))
    return (
      file.startsWith("public/images/stacks/v8/about-") ||
      file === "public/images/stacks/v8/ai-collective-mark.svg"
    );
  if (file.startsWith("public/images/stacks/"))
    return ABOUT_STACK_IMAGE_INPUTS.has(file);
  return !OFF_CAMERA_SCENE_INPUTS.has(file);
}

const WORKING_TREE = "workingTree";
const INDEX = "index";

/** @param {unknown} snapshot */
function assertSnapshot(snapshot) {
  if (snapshot !== WORKING_TREE && snapshot !== INDEX) {
    throw new Error(`Unknown homepage OG snapshot: ${String(snapshot)}`);
  }
}

/** @param {string} root @param {string} file @param {"workingTree" | "index"} snapshot */
async function readSnapshotFile(root, file, snapshot) {
  assertSnapshot(snapshot);
  if (snapshot === WORKING_TREE) return readFile(path.join(root, file));
  const { stdout } = await execFileAsync("git", ["show", `:${file}`], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 25 * 1024 * 1024,
  });
  return stdout;
}

/** @param {string} file */
const isNonVisualSource = (file) =>
  file.endsWith(".md") ||
  file.endsWith(".test.ts") ||
  file.endsWith(".test.tsx");

/** @param {string} root @param {"workingTree" | "index"} snapshot */
async function listInputs(root, snapshot) {
  assertSnapshot(snapshot);
  const sourceArgs =
    snapshot === WORKING_TREE
      ? ["--cached", "--others", "--exclude-standard"]
      : ["--cached"];
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", ...sourceArgs, "--", ...INPUT_PATHS],
    { cwd: root, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );

  return stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => !EXCLUDED_INPUTS.has(file))
    .filter((file) => !isNonVisualSource(file))
    .filter(belongsToAboutCapture)
    .sort();
}

/** @param {{ root: string, snapshot?: "workingTree" | "index" }} options */
export async function homeOgInputManifest({ root, snapshot = WORKING_TREE }) {
  const files = await listInputs(root, snapshot);
  const hash = createHash("sha256");
  /** Per-file digests so a stale report can name the files that moved instead
   * of sending someone to a three-minute build to find out. Truncated because
   * this detects change, it does not defend against forgery — the whole-input
   * `digest` below stays a full SHA-256.
   * @type {Record<string, string>} */
  const fileDigests = {};

  for (const file of files) {
    const content = await readSnapshotFile(root, file, snapshot);
    fileDigests[file] = createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 16);
    hash.update(file);
    hash.update("\0");
    hash.update(String(content.byteLength));
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }

  return {
    version: 2,
    algorithm: "sha256",
    digest: hash.digest("hex"),
    files,
    fileDigests,
  };
}

/** Which watched files differ from the ones the committed capture was made
 * from. Added and removed files count: either changes what renders.
 * @param {{ fileDigests?: Record<string, string> } | undefined} committed
 * @param {{ files: string[], fileDigests: Record<string, string> }} current
 * @returns {{ file: string, change: string }[] | null}
 */
export function homeOgChangedInputs(committed, current) {
  const before = committed?.fileDigests;
  if (!before || typeof before !== "object") return null;
  /** @type {{ file: string, change: string }[]} */
  const changed = [];
  for (const file of current.files) {
    if (!(file in before)) changed.push({ file, change: "added" });
    else if (before[file] !== current.fileDigests[file]) {
      changed.push({ file, change: "changed" });
    }
  }
  for (const file of Object.keys(before)) {
    if (!(file in current.fileDigests))
      changed.push({ file, change: "removed" });
  }
  return changed.sort((a, b) => a.file.localeCompare(b.file));
}

/** @param {{ root: string, snapshot?: "workingTree" | "index" }} options */
export async function homeOgImageDigest({ root, snapshot = WORKING_TREE }) {
  const image = await readSnapshotFile(root, HOME_OG_IMAGE, snapshot);
  return createHash("sha256").update(image).digest("hex");
}

/** Read the visual-input digest embedded in the JPEG itself. Keeping this
 * provenance inside the generated artifact prevents a manifest-only refresh
 * from blessing an image captured from older scene code.
 * @param {{ root: string, snapshot?: "workingTree" | "index" }} options
 */
export async function homeOgImageInputDigest({
  root,
  snapshot = WORKING_TREE,
}) {
  const image = await readSnapshotFile(root, HOME_OG_IMAGE, snapshot);
  const marker = Buffer.from(HOME_OG_PROVENANCE_PREFIX);
  const markerAt = image.lastIndexOf(marker);
  if (markerAt === -1) return null;
  const digestAt = markerAt + marker.length;
  const digest = image.subarray(digestAt, digestAt + 64).toString("ascii");
  return SHA256_PATTERN.test(digest) ? digest : null;
}

/** Check one coherent repository snapshot. The index mode is what makes the
 * pre-commit gate safe when a file has both staged and unstaged changes.
 * @param {{ root: string, snapshot?: "workingTree" | "index" }} options
 */
export async function homeOgArtifactStatus({ root, snapshot = WORKING_TREE }) {
  const committed = JSON.parse(
    (await readSnapshotFile(root, HOME_OG_MANIFEST, snapshot)).toString("utf8"),
  );
  const current = await homeOgInputManifest({ root, snapshot });
  const imageDigest = await homeOgImageDigest({ root, snapshot });
  const capturedInputDigest = await homeOgImageInputDigest({ root, snapshot });
  const inputsMatch =
    committed.version === current.version &&
    committed.algorithm === current.algorithm &&
    committed.digest === current.digest;
  return {
    fresh:
      inputsMatch &&
      committed.image?.digest === imageDigest &&
      committed.image?.inputDigest === current.digest &&
      capturedInputDigest === current.digest,
    files: current.files,
    /** Null when the committed manifest predates per-file digests. */
    changed: inputsMatch ? [] : homeOgChangedInputs(committed, current),
    /** The image itself was edited or replaced without a capture. */
    imageDrifted:
      committed.image?.digest !== imageDigest ||
      capturedInputDigest !== committed.image?.inputDigest,
  };
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
