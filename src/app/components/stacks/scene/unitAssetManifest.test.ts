import { UNITS, type UnitSlug } from "../data";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ATLAS_URLS, RECOLOR_URLS } from "./ModelProp";
import { ABOUT_ROLES } from "./aboutRoleIcons";
import { MODEL_PROP_ATLAS_SETS, UNIT_ASSETS } from "./unitAssetManifest";

const SCENE = path.dirname(new URL(import.meta.url).pathname);
const PUBLIC = path.resolve(SCENE, "../../../../../public");

const UNIT_FILES: Record<UnitSlug, string> = {
  about: "units/UnitAbout.tsx",
  books: "units/UnitBooks.tsx",
  training: "units/UnitTraining.tsx",
  systems: "units/UnitSystems.tsx",
  projects: "units/UnitProjects.tsx",
  blog: "units/UnitBlog.tsx",
  talks: "units/UnitTalks.tsx",
};

// Components that load a fixed asset of their own, keyed by how a shelf
// mounts them.
const COMPONENT_ASSETS: Array<{
  tag: string;
  kind: "models" | "textures";
  url: string;
}> = [
  { tag: "<ShelfSucculent", kind: "models", url: "/models/succulent-pot.glb" },
  { tag: "<EggLamp", kind: "models", url: "/models/desk-lamp.glb" },
  { tag: "<VisionProProp", kind: "models", url: "/models/vision-pro.glb" },
  {
    tag: "<TJMedallionProp",
    kind: "textures",
    url: "/images/stacks/tj-medallion.jpg",
  },
];

function source(slug: UnitSlug) {
  return readFileSync(path.join(SCENE, UNIT_FILES[slug]), "utf8");
}

describe("unit asset manifest", () => {
  it("has an entry for every shelf", () => {
    expect(Object.keys(UNIT_ASSETS).sort()).toEqual(
      UNITS.map((unit) => unit.slug).sort(),
    );
  });

  it.each(UNITS.map((unit) => unit.slug))(
    "%s lists every model its shelf names",
    (slug) => {
      const named = [
        ...source(slug).matchAll(/"(\/models\/[a-z0-9-]+\.glb)"/g),
      ].map((match) => match[1]);
      for (const url of named) expect(UNIT_ASSETS[slug].models).toContain(url);
    },
  );

  it.each(UNITS.map((unit) => unit.slug))(
    "%s lists the assets of the loader components it mounts",
    (slug) => {
      const text = source(slug);
      for (const { tag, kind, url } of COMPONENT_ASSETS) {
        if (text.includes(tag)) expect(UNIT_ASSETS[slug][kind]).toContain(url);
      }
      for (const match of text.matchAll(/artwork="([^"]+)"/g)) {
        expect(UNIT_ASSETS[slug].textures).toContain(match[1]);
      }
      for (const match of text.matchAll(
        /useLoader\(\s*SVGLoader,\s*"([^"]+)"/g,
      )) {
        expect(UNIT_ASSETS[slug].svgs).toContain(match[1]);
      }
      if (text.includes("<ModelProp")) {
        for (const set of MODEL_PROP_ATLAS_SETS) {
          expect(UNIT_ASSETS[slug].textureSets).toContainEqual(set);
        }
      }
    },
  );

  it("lists every About role icon", () => {
    for (const role of ABOUT_ROLES) {
      expect(UNIT_ASSETS.about.textures).toContain(role.artwork);
    }
  });

  it("names only files that exist", () => {
    for (const assets of Object.values(UNIT_ASSETS)) {
      const urls = [
        ...assets.models,
        ...assets.textures,
        ...assets.textureSets.flat(),
        ...assets.svgs,
      ];
      for (const url of urls) {
        expect(existsSync(path.join(PUBLIC, url)), url).toBe(true);
      }
    }
  });

  it("matches ModelProp's atlas pairs", () => {
    expect(MODEL_PROP_ATLAS_SETS).toEqual([ATLAS_URLS, RECOLOR_URLS]);
  });
});
