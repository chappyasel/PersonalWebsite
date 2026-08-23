import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  HOME_OG_IMAGE,
  HOME_OG_MANIFEST,
  homeOgArtifactStatus,
  homeOgImageDigest,
  homeOgImageInputDigest,
  homeOgInputManifest,
  stampHomeOgImage,
  writeHomeOgManifest,
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
  await writeFile(path.join(root, "src/app/page.test.ts"), "test only\n");
  await writeFile(
    path.join(root, "src/app/components/stacks/CONTEXT.md"),
    "docs\n",
  );
  await writeFile(path.join(root, HOME_OG_IMAGE), "image-v1");
  await writeFile(path.join(root, HOME_OG_MANIFEST), "{}\n");
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
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

  it("refuses to bless an old image after its visual inputs change", async () => {
    const root = await fixtureRoot();
    const capturedInputs = await homeOgInputManifest({ root });
    await stampHomeOgImage({
      imagePath: path.join(root, HOME_OG_IMAGE),
      inputDigest: capturedInputs.digest,
    });
    await writeHomeOgManifest({ root });
    expect(await homeOgImageInputDigest({ root })).toBe(capturedInputs.digest);

    await writeFile(path.join(root, "src/app/page.tsx"), "export default 2;\n");

    await expect(writeHomeOgManifest({ root })).rejects.toThrow(
      "Regenerate the homepage OG image",
    );
  });

  it("checks the staged snapshot independently of unstaged changes", async () => {
    const root = await fixtureRoot();
    const capturedInputs = await homeOgInputManifest({ root });
    await stampHomeOgImage({
      imagePath: path.join(root, HOME_OG_IMAGE),
      inputDigest: capturedInputs.digest,
    });
    await writeHomeOgManifest({ root });
    execFileSync("git", ["add", "."], { cwd: root });

    expect(
      await homeOgArtifactStatus({ root, snapshot: "index" }),
    ).toMatchObject({ fresh: true });

    await writeFile(path.join(root, "src/app/page.tsx"), "export default 2;\n");
    expect(
      await homeOgArtifactStatus({ root, snapshot: "workingTree" }),
    ).toMatchObject({ fresh: false });
    expect(
      await homeOgArtifactStatus({ root, snapshot: "index" }),
    ).toMatchObject({ fresh: true });

    execFileSync("git", ["add", "src/app/page.tsx"], { cwd: root });
    expect(
      await homeOgArtifactStatus({ root, snapshot: "index" }),
    ).toMatchObject({ fresh: false });
  });
});
