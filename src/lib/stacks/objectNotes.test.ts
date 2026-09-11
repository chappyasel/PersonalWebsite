import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  type ObjectNote,
  indexObjectNotes,
  objectNoteFor,
  parseObjectNotes,
  updateObjectNoteCaptions,
} from "./objectNotes";
import { SCENE_ARTIFACTS } from "~/app/components/stacks/sceneArtifacts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE = join(root, "content/stacks/objects.md");
const BAKED = join(root, "public/data/scene-objects.json");

const markdown = readFileSync(SOURCE, "utf8");
const notes = parseObjectNotes(markdown);

describe("parseObjectNotes", () => {
  it("reads the fields, the links and the prose", () => {
    const parsed = parseObjectNotes(
      [
        "# Scene objects",
        "",
        "preamble",
        "",
        "## grab:bag:creatine",
        "",
        "Title: Creatine",
        "Status: written",
        "Audience: visitor",
        "Link: Bulk Supplements https://example.com/x",
        "",
        "Five grams a day, every day.",
        "",
        "<!-- Unit 4 -->",
        "",
        "## grab:photo:mystery",
        "",
        "Title: Mystery",
        "Status: needs-owner",
        "",
        "NEEDS: who is in this photo",
      ].join("\n"),
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      id: "grab:bag:creatine",
      title: "Creatine",
      status: "written",
      visitor: true,
      links: [{ label: "Bulk Supplements", href: "https://example.com/x" }],
      body: "Five grams a day, every day.",
    });
    expect(parsed[1]?.status).toBe("needs-owner");
    expect(parsed[1]?.visitor).toBe(false);
    expect(parsed[1]?.needs).toBe("who is in this photo");
    expect(parsed[1]?.body).toBe("");
  });

  it("normalizes escaped wildcard headings for runtime family lookup", () => {
    const [note] = parseObjectNotes(
      "## grab:reading:\\*\n\nTitle: Reading\nStatus: written\n\nCaption.\n",
    );
    expect(note?.id).toBe("grab:reading:*");
    expect(objectNoteFor(indexObjectNotes([note!]), "grab:reading:book-1")).toBe(
      note,
    );
  });

  it("demotes a section whose prose was never written", () => {
    const [note] = parseObjectNotes(
      ["## a:b", "", "Title: A", "Status: written"].join("\n"),
    );
    expect(note?.status).toBe("needs-owner");
  });

  it("strips a multi-line HTML comment out of the section above it", () => {
    // The real file's coverage note is 52 lines. Skipping only the line that
    // OPENS a comment left the rest in the preceding section's prose, and
    // `egg:lamp:floor:6` shipped a caption ending in a literal `-->` with an
    // id-migration list glued to it. A heading inside a comment must not open
    // a section either.
    const notes = parseObjectNotes(
      [
        "## a:thing",
        "Title: A Thing",
        "",
        "The prose that belongs to it.",
        "",
        "<!-- coverage, as of today:",
        "## not:a:section",
        "- one line",
        "- another line",
        "-->",
        "",
        "## b:thing",
        "Title: B Thing",
        "",
        "Its own prose.",
      ].join("\n"),
    );

    expect(notes.map((note) => note.id)).toEqual(["a:thing", "b:thing"]);
    expect(notes[0]!.body).toBe("The prose that belongs to it.");
    expect(notes[0]!.body).not.toContain("-->");
    expect(notes[1]!.body).toBe("Its own prose.");
  });

  it("still drops a comment that opens and closes on one line", () => {
    const notes = parseObjectNotes(
      [
        "## a:thing",
        "Title: A Thing",
        "",
        "<!-- unit break -->",
        "Prose.",
      ].join("\n"),
    );
    expect(notes[0]!.body).toBe("Prose.");
  });

  it("skips a malformed section instead of failing the file", () => {
    const parsed = parseObjectNotes(
      ["## a:b", "Status: written", "", "## c:d", "Title: C", "", "note"].join(
        "\n",
      ),
    );
    expect(parsed.map((note) => note.id)).toEqual(["c:d"]);
  });

  it("falls back to the family template for loop-generated ids", () => {
    const index = indexObjectNotes([
      {
        id: "grab:pills:bottle:*",
        title: "Bottle",
        status: "written",
        visitor: false,
        links: [],
        body: "b",
      },
      // The unit, not the index, is what varies for the shelf planks.
      {
        id: "shelf:*:top",
        title: "Plank",
        status: "written",
        visitor: false,
        links: [],
        body: "b",
      },
      // A whole tail varies: salt, item index and volume index.
      {
        id: "link:row:1:*:*:*",
        title: "Volume",
        status: "written",
        visitor: false,
        links: [],
        body: "b",
      },
    ] satisfies ObjectNote[]);
    expect(objectNoteFor(index, "grab:pills:bottle:3")?.title).toBe("Bottle");
    expect(objectNoteFor(index, "shelf:about:top")?.title).toBe("Plank");
    expect(objectNoteFor(index, "link:row:1:68:2:0")?.title).toBe("Volume");
    expect(objectNoteFor(index, "grab:bag:realgood:0")).toBeNull();
  });

  it("prefers the most specific template", () => {
    const index = indexObjectNotes([
      {
        id: "a:b:*",
        title: "tail",
        status: "written",
        visitor: false,
        links: [],
        body: "b",
      },
      {
        id: "a:*:*",
        title: "wider",
        status: "written",
        visitor: false,
        links: [],
        body: "b",
      },
      {
        id: "a:b:c",
        title: "exact",
        status: "written",
        visitor: false,
        links: [],
        body: "b",
      },
    ] satisfies ObjectNote[]);
    expect(objectNoteFor(index, "a:b:c")?.title).toBe("exact");
    expect(objectNoteFor(index, "a:b:z")?.title).toBe("tail");
    expect(objectNoteFor(index, "a:q:z")?.title).toBe("wider");
  });

  it("updates selected captions without rewriting neighboring sections", () => {
    const source = [
      "# Scene objects",
      "",
      "## photo:one",
      "",
      "Title: One",
      "Status: needs-owner",
      "Audience: visitor",
      "Link: Home https://example.com/",
      "",
      "NEEDS: when this happened",
      "Context: old caption prose, not metadata",
      "",
      "## prop:two",
      "",
      "Title: Two",
      "Status: written",
      "",
      "Keep this exactly.",
      "",
    ].join("\n");

    const updated = updateObjectNoteCaptions(source, [
      { id: "photo:one", body: "A much better caption." },
    ]);

    expect(updated).toContain(
      [
        "## photo:one",
        "",
        "Title: One",
        "Status: written",
        "Audience: visitor",
        "Link: Home https://example.com/",
        "",
        "A much better caption.",
      ].join("\n"),
    );
    expect(updated).not.toContain("NEEDS:");
    expect(updated).not.toContain("Context: old caption prose");
    expect(updated).toContain(
      [
        "## prop:two",
        "",
        "Title: Two",
        "Status: written",
        "",
        "Keep this exactly.",
      ].join("\n"),
    );
  });

  it("adds written status when a valid section omitted it", () => {
    const updated = updateObjectNoteCaptions(
      "## photo:one\n\nTitle: One\nAudience: visitor\n\nOld caption.\n",
      [{ id: "photo:one", body: "New caption." }],
    );
    expect(updated).toContain("Title: One\nStatus: written\nAudience: visitor");
  });

  it.each([
    ["blank captions", [{ id: "photo:one", body: "   " }]],
    ["unknown ids", [{ id: "missing", body: "Caption" }]],
    ["field-shaped prose", [{ id: "photo:one", body: "Note: at home" }]],
    ["new sections", [{ id: "photo:one", body: "## Injected\nBad" }]],
    ["unclosed comments", [{ id: "photo:one", body: "<!-- hidden" }]],
    [
      "duplicate ids",
      [
        { id: "photo:one", body: "First" },
        { id: "photo:one", body: "Second" },
      ],
    ],
  ])("rejects %s", (_label, edits) => {
    expect(() =>
      updateObjectNoteCaptions(
        "## photo:one\n\nTitle: One\nStatus: written\n\nOld caption.\n",
        edits,
      ),
    ).toThrow();
  });
});

describe("content/stacks/objects.md", () => {
  it("has no duplicate ids", () => {
    const seen = new Set<string>();
    const duplicates = notes
      .map((note) => note.id)
      .filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(duplicates).toEqual([]);
  });

  it("uses absolute https links", () => {
    const bad = notes
      .flatMap((note) => note.links)
      .filter((link) => !link.href.startsWith("https://"));
    expect(bad).toEqual([]);
  });

  // Every photograph and model the inspector can put on screen has a section,
  // even when its caption is still waiting on the owner. This is the whole
  // point of the file: a new artifact must not be able to arrive with nothing
  // written about it anywhere.
  it("covers every scene artifact", () => {
    const index = indexObjectNotes(notes);
    const missing = SCENE_ARTIFACTS.filter(
      (artifact) => !objectNoteFor(index, artifact.id),
    ).map((artifact) => artifact.id);
    expect(missing).toEqual([]);
  });

  it("is baked into public/data/scene-objects.json", () => {
    const baked: unknown = JSON.parse(readFileSync(BAKED, "utf8"));
    expect(baked).toEqual(JSON.parse(JSON.stringify(notes)));
  });
});
