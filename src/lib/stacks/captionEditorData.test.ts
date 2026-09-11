import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadCaptionEditorSnapshot,
  saveCaptionEditorSnapshot,
} from "./captionEditorData";

const SOURCE = [
  "# Objects",
  "",
  "## portrait",
  "",
  "Title: Portrait",
  "Status: written",
  "Audience: visitor",
  "",
  "Old caption.",
  "",
  "## prop:two",
  "",
  "Title: Internal",
  "Status: written",
  "",
  "Hidden.",
  "",
].join("\n");

async function fixture(brokenBaked = false) {
  const root = await mkdtemp(join(tmpdir(), "caption-data-"));
  const sourcePath = join(root, "content", "objects.md");
  const bakedPath = join(
    root,
    "public",
    brokenBaked ? "broken" : "objects.json",
  );
  await mkdir(join(root, "content"), { recursive: true });
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(sourcePath, SOURCE);
  if (brokenBaked) await mkdir(bakedPath);
  else await writeFile(bakedPath, "[]\n");
  return { sourcePath, bakedPath };
}

describe("caption editor data", () => {
  it("loads enabled and hidden entries with a revision and section", async () => {
    const snapshot = await loadCaptionEditorSnapshot(await fixture());
    expect(snapshot.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.entries).toEqual([
      expect.objectContaining({
        id: "portrait",
        section: "About",
        kind: "photo",
      }),
      expect.objectContaining({
        id: "prop:two",
        visitor: false,
        body: "Hidden.",
      }),
    ]);
  });

  it("persists visibility in Markdown and JSON and can re-enable a hidden caption", async () => {
    const paths = await fixture();
    let snapshot = await loadCaptionEditorSnapshot(paths);
    for (const visitor of [false, true]) {
      const result = await saveCaptionEditorSnapshot(
        {
          revision: snapshot.revision,
          edits: [{ id: "portrait", visitor }],
        },
        paths,
      );
      expect(result.saved).toBe(true);
      snapshot = await loadCaptionEditorSnapshot(paths);
      expect(snapshot.entries[0]).toMatchObject({
        visitor,
        body: "Old caption.",
      });
      const baked: unknown = JSON.parse(
        await readFile(paths.bakedPath, "utf8"),
      );
      expect(baked).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "portrait",
            visitor,
            body: "Old caption.",
          }),
        ]),
      );
    }
    const result = await saveCaptionEditorSnapshot(
      {
        revision: snapshot.revision,
        edits: [
          { id: "prop:two", body: "A corrected description.", visitor: true },
        ],
      },
      paths,
    );
    expect(result.saved && result.snapshot.entries[1]).toMatchObject({
      visitor: true,
      body: "A corrected description.",
    });
  });

  it("saves against the current revision and rejects stale edits", async () => {
    const paths = await fixture();
    const first = await loadCaptionEditorSnapshot(paths);
    const saved = await saveCaptionEditorSnapshot(
      {
        revision: first.revision,
        edits: [{ id: "portrait", body: "New caption." }],
      },
      paths,
    );
    const stale = await saveCaptionEditorSnapshot(
      {
        revision: first.revision,
        edits: [{ id: "portrait", body: "Lost caption." }],
      },
      paths,
    );

    expect(saved.saved).toBe(true);
    expect(stale).toEqual({ saved: false, reason: "stale" });
    expect(await readFile(paths.sourcePath, "utf8")).toContain("New caption.");
    expect(await readFile(paths.sourcePath, "utf8")).not.toContain(
      "Lost caption.",
    );
  });

  it("serializes concurrent saves so only one revision wins", async () => {
    const paths = await fixture();
    const { revision } = await loadCaptionEditorSnapshot(paths);
    const results = await Promise.all([
      saveCaptionEditorSnapshot(
        { revision, edits: [{ id: "portrait", body: "First change." }] },
        paths,
      ),
      saveCaptionEditorSnapshot(
        { revision, edits: [{ id: "portrait", body: "Second change." }] },
        paths,
      ),
    ]);

    expect(results.filter((result) => result.saved)).toHaveLength(1);
    expect(results.filter((result) => !result.saved)).toEqual([
      { saved: false, reason: "stale" },
    ]);
    const stored = await readFile(paths.sourcePath, "utf8");
    expect(
      stored.includes("First change.") || stored.includes("Second change."),
    ).toBe(true);
  });

  it("restores Markdown when the generated JSON write fails", async () => {
    const paths = await fixture(true);
    const first = await loadCaptionEditorSnapshot(paths);
    await expect(
      saveCaptionEditorSnapshot(
        {
          revision: first.revision,
          edits: [{ id: "portrait", body: "New caption." }],
        },
        paths,
      ),
    ).rejects.toThrow();
    expect(await readFile(paths.sourcePath, "utf8")).toBe(SOURCE);
  });

  it("rejects unknown, duplicate, and blank edits", async () => {
    const paths = await fixture();
    const { revision } = await loadCaptionEditorSnapshot(paths);
    for (const edits of [
      [{ id: "missing", body: "Caption" }],
      [
        { id: "portrait", body: "One" },
        { id: "portrait", body: "Two" },
      ],
      [{ id: "portrait", body: "" }],
    ]) {
      await expect(
        saveCaptionEditorSnapshot({ revision, edits }, paths),
      ).rejects.toThrow();
    }
  });
});
