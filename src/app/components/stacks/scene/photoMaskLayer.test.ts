import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { photographMeshes, registerPhotograph } from "./photoMaskLayer";

describe("the photograph registry", () => {
  it("holds a mesh from registration until its release runs", () => {
    const mesh = new THREE.Mesh();
    const release = registerPhotograph(mesh);
    expect(photographMeshes().has(mesh)).toBe(true);
    release();
    expect(photographMeshes().has(mesh)).toBe(false);
  });

  it("releases only its own mesh and tolerates a double release", () => {
    const a = new THREE.Mesh();
    const b = new THREE.Mesh();
    const releaseA = registerPhotograph(a);
    const releaseB = registerPhotograph(b);
    releaseA();
    releaseA();
    expect(photographMeshes().has(a)).toBe(false);
    expect(photographMeshes().has(b)).toBe(true);
    releaseB();
    expect(photographMeshes().size).toBe(0);
  });

  it("never touches the mesh's own layers, so the room draws it as before", () => {
    const mesh = new THREE.Mesh();
    const before = mesh.layers.mask;
    const release = registerPhotograph(mesh);
    expect(mesh.layers.mask).toBe(before);
    release();
  });
});

// Every scene image goes through LitImage, so that is where a photograph is
// told apart from cover art. The rule: cover art asks for the grade's chroma
// rebuild with `gradeChroma`; a photograph never does, and registers.
describe("LitImage decides what is a photograph", () => {
  const LIT_IMAGE = readFileSync(join(__dirname, "LitImage.tsx"), "utf8");

  it("registers every image unless the caller asks for graded chroma", () => {
    expect(LIT_IMAGE).toContain("if (!mesh.current || gradeChroma) return;");
    expect(LIT_IMAGE).toContain("return registerPhotograph(mesh.current);");
    expect(LIT_IMAGE).toContain("gradeChroma = false");
  });

  function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) return tsxFiles(file);
      return name.endsWith(".tsx") && !name.includes(".test.") ? [file] : [];
    });
  }

  /** Each `<LitImage ... />` element in the scene tree, as its own text. */
  function litImageElements(): Array<{ file: string; text: string }> {
    const out: Array<{ file: string; text: string }> = [];
    for (const file of tsxFiles(__dirname)) {
      if (file.endsWith("LitImage.tsx")) continue;
      const source = readFileSync(file, "utf8");
      let from = 0;
      for (;;) {
        const start = source.indexOf("<LitImage", from);
        if (start < 0) break;
        const end = source.indexOf("/>", start);
        out.push({ file, text: source.slice(start, end) });
        from = end;
      }
    }
    return out;
  }

  it("grades chroma on cover art and on nothing else", () => {
    const elements = litImageElements();
    const covers = elements.filter((e) => e.text.includes("proxiedBookCover("));
    const photographs = elements.filter(
      (e) => !e.text.includes("proxiedBookCover("),
    );
    // The shelf books and the About reading stack are the two cover sites;
    // the rest of the room is photographs.
    expect(covers.length).toBeGreaterThanOrEqual(2);
    expect(photographs.length).toBeGreaterThanOrEqual(8);
    for (const cover of covers)
      expect(cover.text, cover.file).toContain("gradeChroma");
    for (const photograph of photographs)
      expect(photograph.text, photograph.file).not.toContain("gradeChroma");
  });
});
