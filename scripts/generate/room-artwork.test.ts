import catalog from "../../src/app/components/stacks/illustration/artwork/catalog.json";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { extractShelfArtwork } from "./room-artwork-shelf.mjs";
import {
  generate,
  inlineDetails,
  sha256,
  verifyDependencies,
} from "./room-artwork.mjs";

// The repo installs jsdom without its separate declaration package.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    source: string,
    options: { contentType: "image/svg+xml" },
  ) => { window: { document: Document; close(): void } };
};

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});

describe("approved room artwork packaging", () => {
  it("extracts shelf markup byte-for-byte and retains only its definition dependencies", () => {
    const root =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 8 300 200">';
    const shelf =
      '<g data-part="shelf" style="--order:0"><g clip-path="url(#clip)"><polygon points="1,2 3,4 5,6" fill="url(#finish)"/></g></g>';
    const definitions =
      '<defs><linearGradient id="base"><stop offset="0" stop-color="#abc"/></linearGradient><linearGradient id="finish" href="#base"/><clipPath id="clip"><path d="M0 0h10v10Z"/></clipPath></defs>';
    const unused =
      '<defs><image id="prop-photo" href="data:image/png;base64,YQ=="/></defs>';
    const prop = '<g data-part="clock"><path id="prop" d="M20 20"/></g>';
    expect(
      extractShelfArtwork(
        root + definitions + unused + shelf + prop + "</svg>",
      ),
    ).toBe(root + definitions + shelf + "</svg>\n");
  });

  it.each([
    ['<svg viewBox="0 0 1 1"><g data-part="book"/></svg>', "one root shelf"],
    [
      '<svg viewBox="0 0 1 1"><g data-part="shelf"/><g data-part="shelf"/></svg>',
      "one root shelf",
    ],
    [
      '<svg viewBox="0 0 1 1"><g data-part="shelf" fill="url(#missing)"/></svg>',
      "Missing shelf dependency",
    ],
    [
      '<svg viewBox="0 0 1 1"><g data-part="shelf"><use href="#prop"/></g><g id="prop" data-part="clock"/></svg>',
      "outside root definitions",
    ],
    [
      '<svg viewBox="0 0 1 1"><g data-part="shelf"><g data-part="clock"/></g></svg>',
      "another owner",
    ],
  ])(
    "refuses an incomplete or mixed-owner shelf extraction %#",
    (svg, error) => {
      expect(() => extractShelfArtwork(svg)).toThrow(error);
    },
  );

  it.each(Object.values(catalog))(
    "ships exact shelf geometry and the full viewBox for $unit/$theme-$viewport",
    async (asset) => {
      const svg = await readFile(path.join("public", asset.src), "utf8");
      const shelfSrc = `/images/stacks/boot/${asset.unit}/${asset.theme}-${asset.viewport}.shelf.svg`;
      const shelfSvg = await readFile(path.join("public", shelfSrc), "utf8");
      expect(asset.shelfSrc).toBe(shelfSrc);
      expect(shelfSvg).toBe(extractShelfArtwork(svg));
      const original = new JSDOM(svg, { contentType: "image/svg+xml" });
      const extracted = new JSDOM(shelfSvg, { contentType: "image/svg+xml" });
      try {
        const fullRoot = original.window.document.documentElement;
        const shelfRoot = extracted.window.document.documentElement;
        expect(shelfRoot.getAttribute("viewBox")).toBe(
          fullRoot.getAttribute("viewBox"),
        );
        expect(
          shelfRoot
            .querySelector('g[data-part="shelf"]')
            ?.isEqualNode(fullRoot.querySelector('g[data-part="shelf"]')),
        ).toBe(true);
        expect([...shelfRoot.children].map((node) => node.tagName)).toEqual([
          "g",
        ]);
        expect(shelfRoot.querySelectorAll("[data-part]")).toHaveLength(1);
        expect(
          shelfRoot.querySelector(
            "image, use, defs, script, animate, animateTransform",
          ),
        ).toBeNull();
        expect(Buffer.byteLength(shelfSvg)).toBeLessThan(6000);
      } finally {
        original.window.close();
        extracted.window.close();
      }
    },
  );

  it("keeps every generated drawing, shelf, registration and catalog current", async () => {
    await expect(generate({ check: true })).resolves.toMatchObject({
      cases: 24,
    });
  });

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
