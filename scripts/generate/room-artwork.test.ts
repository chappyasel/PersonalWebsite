import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inlineDetails, sha256, verifyDependencies } from "./room-artwork.mjs";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});

describe("approved room artwork packaging", () => {
  it("embeds the exact detail bytes without changing drawing markup", async () => {
    const bytes = Buffer.from("approved raster bytes");
    const svg =
      '<svg viewBox="1 2 30 40"><path d="M1 2" fill="#abc"/><image href="/photo.webp"/></svg>';
    const embedded = await inlineDetails(
      svg,
      [
        {
          href: "/photo.webp",
          file: "photo",
          sha256: sha256(bytes),
          bytes: bytes.length,
          mime: "image/webp",
        },
      ],
      async () => bytes,
    );
    expect(embedded).toBe(
      svg.replace(
        "/photo.webp",
        `data:image/webp;base64,${bytes.toString("base64")}`,
      ),
    );
    await expect(inlineDetails(svg, [], async () => bytes)).rejects.toThrow(
      "Unaccounted",
    );
  });

  it("refuses stale geometry source before generation, without browser access", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "room-artwork-stale-"));
    temporary.push(root);
    await writeFile(path.join(root, "geometry.ts"), "approved source");
    const dependencies = [
      { path: "geometry.ts", sha256: sha256("approved source") },
    ];
    const manifest = {
      dependencies,
      sourceFingerprint: sha256(JSON.stringify(dependencies)),
    };
    await expect(verifyDependencies(root, manifest)).resolves.toBeUndefined();
    await writeFile(path.join(root, "geometry.ts"), "changed dimensions");
    await expect(verifyDependencies(root, manifest)).rejects.toThrow(
      "geometry.ts",
    );
  });
});
