import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { SCENE_PHOTOS } from "~/app/components/stacks/sceneArtifacts";

import { parseObjectNotes, updateObjectNoteCaptions } from "./objectNotes";

export type CaptionEditorPaths = Readonly<{
  sourcePath: string;
  bakedPath: string;
}>;

export type CaptionEditorEntry = Readonly<{
  id: string;
  title: string;
  status: "written" | "needs-owner";
  body: string;
  section: string;
  kind: "photo" | "object";
  image?: string;
}>;

export type CaptionEditorSnapshot = Readonly<{
  revision: string;
  entries: CaptionEditorEntry[];
}>;

export type CaptionEditorSaveInput = Readonly<{
  revision: string;
  edits: ReadonlyArray<Readonly<{ id: string; body: string }>>;
}>;

export type CaptionEditorSaveResult =
  | Readonly<{ saved: true; snapshot: CaptionEditorSnapshot }>
  | Readonly<{ saved: false; reason: "stale" }>;

export const captionEditorPaths = (): CaptionEditorPaths => ({
  sourcePath: path.join(process.cwd(), "content", "stacks", "objects.md"),
  bakedPath: path.join(process.cwd(), "public", "data", "scene-objects.json"),
});

const photoById = new Map<string, { image: string; section: string }>(
  SCENE_PHOTOS.map((photo) => [
    photo.id,
    {
      image: photo.image,
      section: photo.collection.replace("-photos", "").replace(/^./, (c) =>
        c.toUpperCase(),
      ),
    },
  ]),
);

const objectSection: Record<string, string> = {
  "action:about:vision-ride": "About",
  "grab:ai-collective-mark": "About",
  "grab:coordination-research:about": "About",
  "grab:reading:*": "About",
  "grab:tj-medallion:about": "About",
  "egg:globe": "About",
  "aggregate-strength": "Training",
  "big-three": "Training",
  "dexa-history": "Training",
  "lift-table": "Training",
  "systems-supplements-v8": "Systems",
  "egg:clock:alarm": "Systems",
  "link:routineboard": "Systems",
  "action:projects:mac": "Projects",
  "link:projects:weightlifting-icon": "Projects",
  "homework-app": "Projects",
  "grab:paper:5": "Musings",
  "grab:trust-essay:musings": "Musings",
  "grab:vineyard-cutout": "Musings",
  "grab:lighthouse:musings": "Musings",
};

function revisionFor(markdown: string) {
  return createHash("sha256").update(markdown).digest("hex");
}

function snapshotFor(markdown: string): CaptionEditorSnapshot {
  return {
    revision: revisionFor(markdown),
    entries: parseObjectNotes(markdown)
      .filter((note) => note.visitor)
      .map((note) => {
        const photo = photoById.get(note.id);
        return {
          id: note.id,
          title: note.title,
          status: note.status,
          body: note.body,
          section: photo?.section ?? objectSection[note.id] ?? "Other",
          kind: photo ? "photo" : "object",
          ...(photo ? { image: photo.image } : {}),
        };
      }),
  };
}

async function writeAtomic(destination: string, contents: string) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, destination);
}

export async function loadCaptionEditorSnapshot(
  paths = captionEditorPaths(),
): Promise<CaptionEditorSnapshot> {
  return snapshotFor(await readFile(paths.sourcePath, "utf8"));
}

let saveQueue: Promise<void> = Promise.resolve();

async function performCaptionSave(
  input: CaptionEditorSaveInput,
  paths: CaptionEditorPaths,
): Promise<CaptionEditorSaveResult> {
  const markdown = await readFile(paths.sourcePath, "utf8");
  if (revisionFor(markdown) !== input.revision)
    return { saved: false, reason: "stale" };

  const visitorIds = new Set(
    parseObjectNotes(markdown)
      .filter((note) => note.visitor)
      .map((note) => note.id),
  );
  if (input.edits.some((edit) => !visitorIds.has(edit.id)))
    throw new Error("Caption edit contains an unknown id");

  const updated = updateObjectNoteCaptions(markdown, input.edits);
  const baked = `${JSON.stringify(parseObjectNotes(updated), null, 2)}\n`;
  await writeAtomic(paths.sourcePath, updated);
  try {
    await writeAtomic(paths.bakedPath, baked);
  } catch (error) {
    await writeAtomic(paths.sourcePath, markdown);
    throw error;
  }
  return { saved: true, snapshot: snapshotFor(updated) };
}

export function saveCaptionEditorSnapshot(
  input: CaptionEditorSaveInput,
  paths = captionEditorPaths(),
): Promise<CaptionEditorSaveResult> {
  const operation = saveQueue.then(() => performCaptionSave(input, paths));
  saveQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
