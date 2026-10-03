import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  HOME_OG_IMAGE,
  HOME_OG_MANIFEST,
  belongsToRoomOgCapture,
  roomOgArtifactIntegrity,
  roomOgArtifactStatus,
  roomOgChangedInputs,
  roomOgImageDigest,
  roomOgImageInputDigest,
  roomOgInputManifest,
  stampRoomOgImage,
  writeRoomOgManifest,
} from "./room-og-inputs.mjs";

const temporaryRoots: string[] = [];

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "room-og-inputs-"));
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

describe("room OG input manifest", () => {
  it("fingerprints sorted sources without hashing generated outputs", async () => {
    const root = await fixtureRoot();
    const first = await roomOgInputManifest({ root });
    const second = await roomOgInputManifest({ root });

    expect(first).toEqual(second);
    expect(first.files).toEqual(["src/app/page.tsx"]);

    const imageBefore = await roomOgImageDigest({ root });
    await writeFile(path.join(root, HOME_OG_IMAGE), "image-v2");
    expect((await roomOgInputManifest({ root })).digest).toBe(first.digest);
    expect(await roomOgImageDigest({ root })).not.toBe(imageBefore);
  });

  it("changes when a scene source changes", async () => {
    const root = await fixtureRoot();
    const before = await roomOgInputManifest({ root });
    await writeFile(path.join(root, "src/app/page.tsx"), "export default 2;\n");
    const after = await roomOgInputManifest({ root });

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

    const before = await roomOgInputManifest({ root });
    expect(before.files).toEqual(
      expect.arrayContaining(Object.keys(aboutInputs)),
    );
    expect(before.files).not.toEqual(
      expect.arrayContaining(Object.keys(musingsInputs)),
    );

    for (const file of Object.keys(musingsInputs))
      await writeFixtureFile(root, file, "musings-v2\n");
    expect((await roomOgInputManifest({ root })).digest).toBe(before.digest);

    await writeFixtureFile(
      root,
      "src/app/components/stacks/scene/SceneEnvironment.tsx",
      "environment-v2\n",
    );
    expect((await roomOgInputManifest({ root })).digest).not.toBe(
      before.digest,
    );
  });

  it("refuses to bless an old image after its visual inputs change", async () => {
    const root = await fixtureRoot();
    const capturedInputs = await roomOgInputManifest({ root });
    await stampRoomOgImage({
      imagePath: path.join(root, HOME_OG_IMAGE),
      inputDigest: capturedInputs.digest,
    });
    await writeRoomOgManifest({ root });
    expect(await roomOgImageInputDigest({ root })).toBe(capturedInputs.digest);

    await writeFile(path.join(root, "src/app/page.tsx"), "export default 2;\n");

    await expect(writeRoomOgManifest({ root })).rejects.toThrow(
      "Regenerate the about OG image",
    );
  });

  it("checks the staged snapshot independently of unstaged changes", async () => {
    const root = await fixtureRoot();
    const capturedInputs = await roomOgInputManifest({ root });
    await stampRoomOgImage({
      imagePath: path.join(root, HOME_OG_IMAGE),
      inputDigest: capturedInputs.digest,
    });
    await writeRoomOgManifest({ root });
    execFileSync("git", ["add", "."], { cwd: root });

    expect(
      await roomOgArtifactStatus({ root, snapshot: "index" }),
    ).toMatchObject({ fresh: true });

    await writeFile(path.join(root, "src/app/page.tsx"), "export default 2;\n");
    expect(
      await roomOgArtifactStatus({ root, snapshot: "workingTree" }),
    ).toMatchObject({ fresh: false });
    expect(
      await roomOgArtifactStatus({ root, snapshot: "index" }),
    ).toMatchObject({ fresh: true });

    execFileSync("git", ["add", "src/app/page.tsx"], { cwd: root });
    expect(
      await roomOgArtifactStatus({ root, snapshot: "index" }),
    ).toMatchObject({ fresh: false });
  });
});

const currentManifest = (fileDigests: Record<string, string>) => ({
  files: Object.keys(fileDigests).sort(),
  fileDigests,
});

describe("roomOgChangedInputs", () => {
  it("names the files whose contents moved", () => {
    expect(
      roomOgChangedInputs(
        { fileDigests: { "a.ts": "1111", "b.ts": "2222" } },
        currentManifest({ "a.ts": "1111", "b.ts": "9999" }),
      ),
    ).toEqual([{ file: "b.ts", change: "changed" }]);
  });

  it("counts an added or removed watched file as a change", () => {
    expect(
      roomOgChangedInputs(
        { fileDigests: { "a.ts": "1111", "gone.ts": "3333" } },
        currentManifest({ "a.ts": "1111", "new.ts": "4444" }),
      ),
    ).toEqual([
      { file: "gone.ts", change: "removed" },
      { file: "new.ts", change: "added" },
    ]);
  });

  it("reports nothing when every watched file matches", () => {
    expect(
      roomOgChangedInputs(
        { fileDigests: { "a.ts": "1111" } },
        currentManifest({ "a.ts": "1111" }),
      ),
    ).toEqual([]);
  });

  // The gate has to stay usable across the format bump rather than crash or,
  // worse, claim nothing changed. The check prints an explanation in place of
  // a file list when it sees this.
  it("returns null for a manifest written before per-file digests", () => {
    expect(
      roomOgChangedInputs({}, currentManifest({ "a.ts": "1" })),
    ).toBeNull();
    expect(
      roomOgChangedInputs(undefined, currentManifest({ "a.ts": "1" })),
    ).toBeNull();
  });
});

describe("capture-removed inputs", () => {
  // The boot screen and the native room document are display:none during capture, so the
  // manifest stops watching the files that only render them. room-og-scene.mjs
  // asserts that at capture time, which is what keeps this honest.
  it("stops watching the surfaces the capture removes", async () => {
    const root = await fixtureRoot();
    await writeFixtureFile(
      root,
      "src/app/components/stacks/dom/BootScreen.tsx",
      "boot\n",
    );
    await writeFixtureFile(
      root,
      "src/app/components/stacks/illustration/RoomDocument.tsx",
      "flat\n",
    );
    await writeFixtureFile(
      root,
      "src/app/components/stacks/dom/ChromeLayer.tsx",
      "chrome\n",
    );

    const { files } = await roomOgInputManifest({ root });

    expect(files).not.toContain("src/app/components/stacks/dom/BootScreen.tsx");
    expect(files).not.toContain(
      "src/app/components/stacks/illustration/RoomDocument.tsx",
    );
    // Everything else the homepage renders is only visibility:hidden, and the
    // rail's measured width still moves the camera's About stop.
    expect(files).toContain("src/app/components/stacks/dom/ChromeLayer.tsx");
  });
});

describe("per-card inputs", () => {
  const room = (file: string) => (card: string) =>
    belongsToRoomOgCapture(card, file);

  it("watches each shelf's own unit sources and models, and only its own", () => {
    const projects = room(
      "src/app/components/stacks/scene/units/UnitProjects.tsx",
    );
    expect(["projects"].every(projects)).toBe(true);
    expect(["about", "musings", "talks", "golf"].some(projects)).toBe(false);

    const lighthouse = room("public/models/lighthouse.glb");
    expect(lighthouse("musings")).toBe(true);
    expect(["about", "projects", "talks", "golf"].some(lighthouse)).toBe(false);
  });

  it("keeps both shelves beside the golf green on the golf card", () => {
    expect(
      belongsToRoomOgCapture(
        "golf",
        "src/app/components/stacks/scene/units/UnitBooks.tsx",
      ),
    ).toBe(true);
    expect(
      belongsToRoomOgCapture(
        "golf",
        "src/app/components/stacks/scene/units/UnitTraining.tsx",
      ),
    ).toBe(true);
    expect(belongsToRoomOgCapture("golf", "public/models/golf-flag.glb")).toBe(
      true,
    );
  });

  it("watches a shelf's photographs at every size", () => {
    for (const file of [
      "public/images/stacks/v8/talk-panel.webp",
      "public/images/stacks/v8/256/talk-panel.webp",
      "public/images/stacks/v8/512/talk-panel.webp",
    ]) {
      expect(belongsToRoomOgCapture("talks", file)).toBe(true);
      expect(belongsToRoomOgCapture("projects", file)).toBe(false);
    }
    // The role tiles beside the Apple sit on About and draw from 512/.
    expect(
      belongsToRoomOgCapture(
        "about",
        "public/images/stacks/v8/512/about-madrona-icon.webp",
      ),
    ).toBe(true);
  });

  it("shares the scene, the meadow, and the styles across every card", () => {
    for (const card of ["about", "projects", "musings", "talks", "golf"]) {
      expect(
        belongsToRoomOgCapture(
          card,
          "src/app/components/stacks/scene/SceneEnvironment.tsx",
        ),
      ).toBe(true);
      expect(
        belongsToRoomOgCapture(
          card,
          "public/images/stacks/grass-tuft-alpha.webp",
        ),
      ).toBe(true);
      expect(
        belongsToRoomOgCapture(
          card,
          "src/app/components/stacks/dom/BootScreen.tsx",
        ),
      ).toBe(false);
    }
  });

  it("leaves the Musings shelf geometry to the Musings card", () => {
    const file = "src/app/components/stacks/scene/musingsShelfGeometry.ts";
    expect(belongsToRoomOgCapture("musings", file)).toBe(true);
    expect(belongsToRoomOgCapture("about", file)).toBe(false);
  });

  it("does not hash one card's output as another card's input", async () => {
    const root = await fixtureRoot();
    await writeFixtureFile(root, "public/images/stacks/og/projects.jpg", "x");
    await writeFixtureFile(
      root,
      "public/images/stacks/og/projects.inputs.json",
      "{}",
    );
    execFileSync("git", ["add", "."], { cwd: root });
    for (const card of ["about", "projects"]) {
      const { files } = await roomOgInputManifest({ root, card });
      expect(files.some((file) => file.includes("/og/"))).toBe(false);
    }
  });

  it("reports a card that was never generated as missing, not as a crash", async () => {
    const root = await fixtureRoot();
    await expect(
      roomOgArtifactStatus({ root, card: "talks" }),
    ).resolves.toMatchObject({ fresh: false, missing: true });
    await expect(
      roomOgArtifactIntegrity({ root, card: "talks" }),
    ).resolves.toMatchObject({ missing: true, intact: false });
  });
});

describe("card integrity", () => {
  // The pre-commit hook asks only this: is the committed JPEG the capture
  // its manifest describes? A watched source changing is not its business.
  it("passes a captured card after its sources move, and fails a hand edit", async () => {
    const root = await fixtureRoot();
    const capturedInputs = await roomOgInputManifest({ root });
    await stampRoomOgImage({
      imagePath: path.join(root, HOME_OG_IMAGE),
      inputDigest: capturedInputs.digest,
    });
    await writeRoomOgManifest({ root });
    expect(await roomOgArtifactIntegrity({ root })).toMatchObject({
      intact: true,
    });

    await writeFile(path.join(root, "src/app/page.tsx"), "export default 2;\n");
    expect(await roomOgArtifactIntegrity({ root })).toMatchObject({
      intact: true,
    });
    expect(await roomOgArtifactStatus({ root })).toMatchObject({
      fresh: false,
    });

    await writeFile(path.join(root, HOME_OG_IMAGE), "edited by hand");
    expect(await roomOgArtifactIntegrity({ root })).toMatchObject({
      intact: false,
    });
  });
});
