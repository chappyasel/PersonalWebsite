import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  HOME_OG_IMAGE,
  HOME_OG_MANIFEST,
  homeOgImageDigest,
  homeOgInputManifest,
} from "./home-og-inputs.mjs";

const temporaryRoots: string[] = [];

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "home-og-inputs-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "src/app/components/stacks"), {
    recursive: true,
  });
  await mkdir(path.join(root, "public/images/stacks"), { recursive: true });
  await writeFile(path.join(root, "src/app/page.tsx"), "export default 1;\n");
  await writeFile(path.join(root, HOME_OG_IMAGE), "image-v1");
  await writeFile(path.join(root, HOME_OG_MANIFEST), "{}\n");
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("home OG input manifest", () => {
  it("fingerprints sorted sources without hashing generated outputs", async () => {
    const root = await fixtureRoot();
    const first = await homeOgInputManifest({ root });
    const second = await homeOgInputManifest({ root });

    expect(first).toEqual(second);
    expect(first.files).toEqual(["src/app/page.tsx"]);

    const imageBefore = await homeOgImageDigest({ root });
    await writeFile(path.join(root, HOME_OG_IMAGE), "image-v2");
    expect((await homeOgInputManifest({ root })).digest).toBe(first.digest);
    expect(await homeOgImageDigest({ root })).not.toBe(imageBefore);
  });

  it("changes when a scene source changes", async () => {
    const root = await fixtureRoot();
    const before = await homeOgInputManifest({ root });
    await writeFile(path.join(root, "src/app/page.tsx"), "export default 2;\n");
    const after = await homeOgInputManifest({ root });

    expect(after.digest).not.toBe(before.digest);
  });
});
