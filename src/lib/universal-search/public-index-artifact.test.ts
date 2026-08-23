import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertPublicSearchIndexArtifactFresh,
  buildPublicSearchIndexArtifact,
  writePublicSearchIndexArtifact,
} from "./public-index-artifact";

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "public-search-index-"));
  const data = join(root, "public", "data");
  await mkdir(data, { recursive: true });
  const sources = {
    "manual.json": { sections: [] },
    "routine.json": {
      whyEarly: [],
      timeline: { am: [], pm: [] },
      supplements: { am: [], pm: [] },
      rants: [],
    },
    "blog-posts.json": { items: [] },
    "projects.json": { projects: [] },
  };
  await Promise.all(
    Object.entries(sources).map(([name, value]) =>
      writeFile(join(data, name), `${JSON.stringify(value)}\n`, "utf8"),
    ),
  );
  return root;
}

describe("public search index artifact", () => {
  it("writes the exact deterministic build output and verifies freshness", async () => {
    const root = await fixtureRoot();
    const expected = await buildPublicSearchIndexArtifact(root);

    await writePublicSearchIndexArtifact(root);

    await expect(
      assertPublicSearchIndexArtifactFresh(root),
    ).resolves.toBeUndefined();
    expect(expected.endsWith("\n")).toBe(true);
    expect(expected.split("\n")).toHaveLength(2);
  });

  it("fails freshness after any source changes", async () => {
    const root = await fixtureRoot();
    await writePublicSearchIndexArtifact(root);
    await writeFile(
      join(root, "public", "data", "projects.json"),
      '{"projects":[],"changed":true}\n',
      "utf8",
    );

    await expect(assertPublicSearchIndexArtifactFresh(root)).rejects.toThrow(
      "pnpm generate:search-index",
    );
  });
});
