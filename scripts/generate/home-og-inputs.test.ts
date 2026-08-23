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

async function writeFixtureFile(root: string, file: string, contents: string) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), contents);
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

  it("does not fingerprint units and assets outside the About capture", async () => {
    const root = await fixtureRoot();
    const aboutInputs = {
      "src/app/components/stacks/scene/SceneEnvironment.tsx":
        "environment-v1\n",
      "src/app/components/stacks/scene/units/UnitAbout.tsx": "about-v1\n",
      "public/models/globe.glb": "globe-v1\n",
      "public/images/stacks/v8/about-family.webp": "family-v1\n",
    };
    const musingsInputs = {
      "src/app/components/stacks/scene/units/UnitBlog.tsx": "musings-v1\n",
      "src/app/components/stacks/scene/lighthouseBeaconDiagnostics.ts":
        "diagnostics-v1\n",
      "public/models/lighthouse.glb": "lighthouse-v1\n",
      "public/images/stacks/musings/vineyard-sign.webp": "sign-v1\n",
    };
    for (const [file, contents] of Object.entries({
      ...aboutInputs,
      ...musingsInputs,
    }))
      await writeFixtureFile(root, file, contents);
    execFileSync("git", ["add", "."], { cwd: root });

    const before = await homeOgInputManifest({ root });
    expect(before.files).toEqual(
      expect.arrayContaining(Object.keys(aboutInputs)),
    );
    expect(before.files).not.toEqual(
      expect.arrayContaining(Object.keys(musingsInputs)),
    );

    for (const file of Object.keys(musingsInputs))
      await writeFixtureFile(root, file, "musings-v2\n");
    expect((await homeOgInputManifest({ root })).digest).toBe(before.digest);

    await writeFixtureFile(
      root,
      "src/app/components/stacks/scene/SceneEnvironment.tsx",
      "environment-v2\n",
    );
    expect((await homeOgInputManifest({ root })).digest).not.toBe(
      before.digest,
    );
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
