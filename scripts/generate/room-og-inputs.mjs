import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { ROOM_OG_CARDS, ROOM_OG_SLUGS, roomOgCard } from "./room-og-config.mjs";

const execFileAsync = promisify(execFile);

export const HOME_OG_MANIFEST = ROOM_OG_CARDS.about.manifest;
export const HOME_OG_IMAGE = ROOM_OG_CARDS.about.image;
const HOME_OG_PROVENANCE_PREFIX = "\nSTACKS_HOME_OG_INPUT_SHA256=";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const SHARED_INPUT_PATHS = Object.freeze([
  "src/app/layout.tsx",
  "src/app/RoomHomePage.tsx",
  "src/app/components/stacks",
  "src/components/ui",
  "src/styles",
  "scripts/generate/room-og-scene.mjs",
  "scripts/generate/room-og-config.mjs",
  "public/models",
  "public/images/stacks",
]);

/** Every card's image and manifest. None of them is an input to any card.
 * @type {Set<string>} */
const GENERATED_OUTPUTS = new Set(
  Object.values(ROOM_OG_CARDS).flatMap(({ image, manifest }) => [
    image,
    manifest,
  ]),
);

const UNITS_DIR = "src/app/components/stacks/scene/units/";
const MODELS_DIR = "public/models/";
const STACK_IMAGES_DIR = "public/images/stacks/";
const V8_DIR = "public/images/stacks/v8/";

/** Unit sources every shelf is built from. */
const SHARED_UNIT_SOURCES = ["types.ts", "unitShelfLayout.ts"];
/** The meadow's tuft alpha is under every shelf. */
const SHARED_STACK_IMAGES = ["grass-tuft-alpha.webp"];

/** What each card is a capture of, beyond the shared scene.
 *
 * Every card is a fixed, head-on capture of one shelf. Keep its fingerprint
 * tied to that frame rather than to every off-camera Unit that happens to
 * share the homepage bundle. Shared scene and rendering sources remain
 * watched by every card; only Unit-local sources and assets are narrowed
 * here, to the files the card's shelf loads.
 *
 * The lists were read off each Unit's own files (the `/models/` and
 * `/images/stacks/` strings in it and in the unit-local helpers it imports).
 * A file missing from a list means a change to it does not mark the card
 * stale, so when a shelf gains a prop, add its model here.
 *
 * - `routes`: the page files the capture renders, beside the shared layout.
 * - `unitSources`: files under scene/units/ that build this shelf.
 * - `models`: GLBs under public/models/ this shelf loads.
 * - `v8Prefixes`, `v8Files`: shelf photographs and artwork under v8/, at
 *   every size (`v8/256/`, `v8/512/` included), by file name.
 * - `stackImages`: other files under public/images/stacks/, relative to it.
 * - `onCamera`: scene files the other cards leave out as off camera. */
/** @typedef {{ routes: string[], extraPaths: string[], unitSources: string[], models: string[], v8Prefixes: string[], v8Files: string[], stackImages: string[], onCamera: string[] }} RoomOgCardInputs */
/** @type {Readonly<Record<string, RoomOgCardInputs>>} */
const CARD_INPUTS = Object.freeze({
  about: {
    routes: ["src/app/page.tsx"],
    extraPaths: ["public/images/about"],
    unitSources: [
      "ShelfSucculent.tsx",
      "UnitAbout.tsx",
      "aboutReadingStack.ts",
      "featuredBookGeometry.ts",
    ],
    /** The card is screenshot mode's still (room-og-config.mjs), which renders
     * neither the couch nor the seam monstera, so `couch.glb` and
     * `potted-plant.glb` are not inputs. The Projects Macintosh the mode
     * would stand in the portrait's place is not in it either: the capture
     * keeps the portrait, so UnitProjects.tsx stays a Unit-local source of
     * another shelf. */
    models: [
      "cactus.glb",
      "desk-lamp.glb",
      "dumbbell.glb",
      "globe.glb",
      "succulent-pot.glb",
    ],
    v8Prefixes: ["about-"],
    // The AI Collective mark, and the Weightlifting app icon among the role
    // tiles beside the Apple (aboutRoleIcons.ts).
    v8Files: ["ai-collective-mark.svg", "projects-weightlifting-icon.webp"],
    stackImages: ["tj-medallion.jpg"],
    onCamera: [],
  },
  projects: {
    routes: ["src/app/projects/page.tsx"],
    extraPaths: [],
    unitSources: [
      "PhoneScreen.tsx",
      "ProjectArtifacts.tsx",
      "UnitProjects.tsx",
      "phoneScreenLayout.ts",
      "projectsShelfLighting.ts",
    ],
    models: [
      "arduino.glb",
      "circuit-board.glb",
      "mac.glb",
      "phone.glb",
      "potted-plant.glb",
      "trophy.glb",
      "yucca-plant.glb",
    ],
    v8Prefixes: ["projects-"],
    v8Files: [],
    stackImages: [],
    onCamera: [],
  },
  musings: {
    routes: ["src/app/page.tsx"],
    extraPaths: [],
    unitSources: [
      "LighthouseBeacon.tsx",
      "SandTray.tsx",
      "ShelfSucculent.tsx",
      "TrustEssay.tsx",
      "UnitBlog.tsx",
      "VineyardCutout.tsx",
      "VineyardSign.tsx",
      "musingsShelfLighting.ts",
      "vineyardOutline.ts",
    ],
    models: [
      "cup-tea.glb",
      "desk-lamp.glb",
      "headphones.glb",
      "kettle.glb",
      "lighthouse.glb",
      "mug.glb",
      "open-book.glb",
      "succulent-pot.glb",
    ],
    v8Prefixes: [],
    v8Files: [],
    stackImages: ["musings/", "vineyard-vines-sticker.svg"],
    onCamera: ["src/app/components/stacks/scene/musingsShelfGeometry.ts"],
  },
  talks: {
    routes: ["src/app/talks/page.tsx"],
    extraPaths: [],
    unitSources: [
      "StickerCamera.tsx",
      "UnitTalks.tsx",
      "talkGalleryLayout.ts",
      "talkPhotoSetups.tsx",
    ],
    models: [
      "harmonica.glb",
      "lamp-floor.glb",
      "microphone.glb",
      "phone.glb",
      "pothos.glb",
      "potted-plant.glb",
    ],
    v8Prefixes: ["talk-"],
    v8Files: [],
    stackImages: [],
    onCamera: [],
  },
  /** The golf stop keeps both shelves beside the green: Books, and
   * Weightlifting, which owns the flag, tees, balls, and club
   * (screenshotMode.ts, SCREENSHOT_GOLF_UNITS). Books' spines and covers come
   * from the library, not from files here. */
  golf: {
    routes: ["src/app/golf/page.tsx"],
    extraPaths: [],
    unitSources: [
      "TrainingFigureCards.tsx",
      "UnitBooks.tsx",
      "UnitTraining.tsx",
      "trainingBoardLayout.ts",
      "trainingGolfBall.ts",
      "trainingTubs.tsx",
    ],
    models: [
      "barbell.glb",
      "baseball.glb",
      "basketball.glb",
      "dumbbell.glb",
      "golf-club.glb",
      "golf-flag.glb",
      "golf-tee.glb",
      "protein-powder.glb",
      "tennis-ball.glb",
    ],
    v8Prefixes: ["training-"],
    v8Files: [],
    stackImages: ["artifacts/", "reginald-solo-logo.webp", "training-figures/"],
    onCamera: [],
  },
});

/** Scene sources no card can see. The diagnostics only draw with `?debug=1`
 * or the Scene console, and neither is part of a capture. The Musings shelf
 * geometry is off camera for every card but its own (`onCamera`). */
const OFF_CAMERA_SCENE_INPUTS = new Set([
  "src/app/components/stacks/scene/InsectPerchDiagnostics.tsx",
  "src/app/components/stacks/scene/lighthouseBeaconDiagnostics.ts",
  "src/app/components/stacks/scene/musingsShelfGeometry.ts",
  "src/app/components/stacks/scene/sceneDiagnosticsRegistry.ts",
]);

/** Surfaces the capture removes outright rather than merely hiding.
 *
 * StacksHome sets `display: none` on `.stacks-boot` and `.room-document` under
 * `html[data-og-capture]`, so neither contributes a pixel or a layout box to
 * the card, and a file whose only job is to render one of them cannot change
 * what is captured. This is deliberately narrower than "hidden": the rest of
 * the homepage chrome is `visibility: hidden`, which still occupies layout —
 * and the rail's measured width feeds the camera's About stop, so UnitRail
 * stays watched.
 *
 * `room-og-scene.mjs` asserts both selectors compute to `display: none` at
 * capture time, so this list fails loudly instead of silently rotting.
 *
 * `boot/aboutBootStage.ts` is here on a different footing. It renders nothing;
 * it writes `data-boot-stage` and the `--stacks-boot-stage-*` properties onto
 * documentElement, which capture mode does NOT remove, and it has a live
 * importer in UnitRail, which stays watched. What makes it inert for the card
 * is that everything it writes is read only inside `.stacks-boot`, so the
 * capture asserts that separately by scanning the stylesheet. */
const CAPTURE_REMOVED_INPUTS = new Set([
  "src/app/components/stacks/illustration/RoomDocument.tsx",
  "src/app/components/stacks/boot/aboutBootStage.ts",
  "src/app/components/stacks/dom/BootScreen.tsx",
  "src/app/components/stacks/dom/bootReadingBooks.ts",
  "src/app/components/stacks/dom/bootVignette.ts",
]);

/** @param {string} slug */
function cardInputs(slug) {
  roomOgCard(slug);
  return /** @type {RoomOgCardInputs} */ (CARD_INPUTS[slug]);
}

/** @param {string} slug */
function inputPaths(slug) {
  const inputs = cardInputs(slug);
  return [...inputs.routes, ...inputs.extraPaths, ...SHARED_INPUT_PATHS];
}

/** @param {ReturnType<typeof cardInputs>} inputs @param {string} relative */
function inStackImages(inputs, relative) {
  return [...SHARED_STACK_IMAGES, ...inputs.stackImages].some((entry) =>
    entry.endsWith("/") ? relative.startsWith(entry) : relative === entry,
  );
}

/** @param {string} slug @param {string} file */
export function belongsToRoomOgCapture(slug, file) {
  const inputs = cardInputs(slug);
  if (CAPTURE_REMOVED_INPUTS.has(file)) return false;
  if (file.startsWith(UNITS_DIR)) {
    const name = file.slice(UNITS_DIR.length);
    return (
      SHARED_UNIT_SOURCES.includes(name) || inputs.unitSources.includes(name)
    );
  }
  if (file.startsWith(MODELS_DIR))
    return inputs.models.includes(file.slice(MODELS_DIR.length));
  if (file.startsWith(V8_DIR)) {
    const name = path.posix.basename(file);
    return (
      inputs.v8Prefixes.some((prefix) => name.startsWith(prefix)) ||
      inputs.v8Files.includes(name)
    );
  }
  if (file.startsWith(STACK_IMAGES_DIR))
    return inStackImages(inputs, file.slice(STACK_IMAGES_DIR.length));
  if (inputs.onCamera.includes(file)) return true;
  return !OFF_CAMERA_SCENE_INPUTS.has(file);
}

const WORKING_TREE = "workingTree";
const INDEX = "index";

/** @param {unknown} snapshot */
function assertSnapshot(snapshot) {
  if (snapshot !== WORKING_TREE && snapshot !== INDEX) {
    throw new Error(`Unknown room OG snapshot: ${String(snapshot)}`);
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

/** @param {string} root @param {"workingTree" | "index"} snapshot @param {string} card */
async function listInputs(root, snapshot, card) {
  assertSnapshot(snapshot);
  const sourceArgs =
    snapshot === WORKING_TREE
      ? ["--cached", "--others", "--exclude-standard"]
      : ["--cached"];
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", ...sourceArgs, "--", ...inputPaths(card)],
    { cwd: root, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );

  return stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => !GENERATED_OUTPUTS.has(file))
    .filter((file) => !isNonVisualSource(file))
    .filter((file) => belongsToRoomOgCapture(card, file))
    .sort();
}

/** @typedef {{ root: string, snapshot?: "workingTree" | "index", card?: string }} RoomOgOptions */

/** @param {RoomOgOptions} options */
export async function roomOgInputManifest({
  root,
  snapshot = WORKING_TREE,
  card = "about",
}) {
  const files = await listInputs(root, snapshot, card);
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
export function roomOgChangedInputs(committed, current) {
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

/** @param {RoomOgOptions} options */
export async function roomOgImageDigest({
  root,
  snapshot = WORKING_TREE,
  card = "about",
}) {
  const image = await readSnapshotFile(root, roomOgCard(card).image, snapshot);
  return createHash("sha256").update(image).digest("hex");
}

/** @param {Buffer} image */
function embeddedInputDigest(image) {
  const marker = Buffer.from(HOME_OG_PROVENANCE_PREFIX);
  const markerAt = image.lastIndexOf(marker);
  if (markerAt === -1) return null;
  const digestAt = markerAt + marker.length;
  const digest = image.subarray(digestAt, digestAt + 64).toString("ascii");
  return SHA256_PATTERN.test(digest) ? digest : null;
}

/** Read the visual-input digest embedded in the JPEG itself. Keeping this
 * provenance inside the generated artifact prevents a manifest-only refresh
 * from blessing an image captured from older scene code.
 * @param {RoomOgOptions} options
 */
export async function roomOgImageInputDigest({
  root,
  snapshot = WORKING_TREE,
  card = "about",
}) {
  return embeddedInputDigest(
    await readSnapshotFile(root, roomOgCard(card).image, snapshot),
  );
}

/** The committed card and manifest, or null when either is missing, which is
 * what a card that has never been generated looks like.
 * @param {RoomOgOptions} options */
async function readCommittedCard({ root, snapshot = WORKING_TREE, card }) {
  const { image: imagePath, manifest: manifestPath } = roomOgCard(
    card ?? "about",
  );
  try {
    const [manifest, image] = await Promise.all([
      readSnapshotFile(root, manifestPath, snapshot),
      readSnapshotFile(root, imagePath, snapshot),
    ]);
    return { manifest: JSON.parse(manifest.toString("utf8")), image };
  } catch {
    return null;
  }
}

/** Whether the committed JPEG is the capture its own manifest describes:
 * the image digest matches, and the provenance stamped inside the JPEG
 * names the inputs the manifest records. This says nothing about whether
 * the scene has moved since; it catches a card replaced or edited by hand,
 * and a card committed without its manifest.
 * @param {RoomOgOptions} options
 */
export async function roomOgArtifactIntegrity({
  root,
  snapshot = WORKING_TREE,
  card = "about",
}) {
  const committed = await readCommittedCard({ root, snapshot, card });
  if (!committed) return { card, missing: true, intact: false };
  const imageDigest = createHash("sha256")
    .update(committed.image)
    .digest("hex");
  const capturedInputDigest = embeddedInputDigest(committed.image);
  const intact =
    committed.manifest.image?.digest === imageDigest &&
    capturedInputDigest === committed.manifest.image?.inputDigest &&
    capturedInputDigest === committed.manifest.digest;
  return { card, missing: false, intact };
}

/** Check one coherent repository snapshot. The index mode is what makes the
 * pre-commit gate safe when a file has both staged and unstaged changes.
 * @param {RoomOgOptions} options
 */
export async function roomOgArtifactStatus({
  root,
  snapshot = WORKING_TREE,
  card = "about",
}) {
  const committed = await readCommittedCard({ root, snapshot, card });
  const current = await roomOgInputManifest({ root, snapshot, card });
  if (!committed) {
    return {
      card,
      fresh: false,
      missing: true,
      files: current.files,
      changed: null,
      imageDrifted: false,
    };
  }
  const { manifest } = committed;
  const imageDigest = createHash("sha256")
    .update(committed.image)
    .digest("hex");
  const capturedInputDigest = embeddedInputDigest(committed.image);
  const inputsMatch =
    manifest.version === current.version &&
    manifest.algorithm === current.algorithm &&
    manifest.digest === current.digest;
  return {
    card,
    fresh:
      inputsMatch &&
      manifest.image?.digest === imageDigest &&
      manifest.image?.inputDigest === current.digest &&
      capturedInputDigest === current.digest,
    missing: false,
    files: current.files,
    /** Null when the committed manifest predates per-file digests. */
    changed: inputsMatch ? [] : roomOgChangedInputs(manifest, current),
    /** The image itself was edited or replaced without a capture. */
    imageDrifted:
      manifest.image?.digest !== imageDigest ||
      capturedInputDigest !== manifest.image?.inputDigest,
  };
}

/** Stamp a completed capture before it replaces the committed JPEG. JPEG
 * readers permit trailing application data, so the pixels remain unchanged
 * while the artifact carries independently checkable capture provenance.
 * @param {{ imagePath: string, inputDigest: string }} options
 */
export async function stampRoomOgImage({ imagePath, inputDigest }) {
  if (!SHA256_PATTERN.test(inputDigest)) {
    throw new Error("Room OG input digest must be a SHA-256 hex string.");
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

/** @param {{ root: string, card?: string }} options */
export async function writeRoomOgManifest({ root, card = "about" }) {
  const { image, manifest: manifestFile } = roomOgCard(card);
  const manifestPath = path.join(root, manifestFile);
  const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
  const inputs = await roomOgInputManifest({ root, card });
  const capturedInputDigest = await roomOgImageInputDigest({ root, card });
  if (capturedInputDigest !== inputs.digest) {
    throw new Error(
      `Regenerate the ${card} OG image; the current JPEG was not captured from these visual inputs.`,
    );
  }
  const manifest = {
    ...inputs,
    image: {
      path: image,
      digest: await roomOgImageDigest({ root, card }),
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

export { ROOM_OG_SLUGS };
