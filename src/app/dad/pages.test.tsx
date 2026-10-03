import fs from "fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { dadAccessToken } from "~/lib/dad/access";

import InsightPage from "./insights/[slug]/page";
import JournalEntryPage from "./journal/[year]/[slug]/page";
import EpiloguePage from "./journal/epilogue/page";
import JournalIndexPage from "./journal/page";
import PrefacePage from "./journal/preface/page";
import LifeStoryPage from "./life-story/page";
import DadPage from "./page";

const { cookieValue } = vi.hoisted(() => ({
  cookieValue: { current: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "dad-access" && cookieValue.current
        ? { name, value: cookieValue.current }
        : undefined,
  })),
}));

vi.mock("~/env", () => ({
  env: { DAD_CONTENT_PASSWORD: "correct-password" },
}));

const FIXTURE_FILES = [
  "Insights/00-life-story.md",
  "Insights/01-private-insight.md",
  "Journal/index.md",
  "Journal/preface.md",
  "Journal/epilogue.md",
  "Journal/2006/2006-06-18.md",
  "Journal/2006/2006-07-01.md",
];

// Every page under src/app/dad, keyed by its file path, called the way Next
// calls it. A new page fails the coverage test until it is added here.
const PAGES: Record<string, () => Promise<unknown>> = {
  "page.tsx": () => DadPage(),
  "journal/page.tsx": () => JournalIndexPage(),
  "journal/preface/page.tsx": () => PrefacePage(),
  "journal/epilogue/page.tsx": () => EpiloguePage(),
  "life-story/page.tsx": () => LifeStoryPage(),
  "insights/[slug]/page.tsx": () =>
    InsightPage({ params: Promise.resolve({ slug: "01-private-insight" }) }),
  "journal/[year]/[slug]/page.tsx": () =>
    JournalEntryPage({
      params: Promise.resolve({ year: "2006", slug: "2006-06-18" }),
    }),
};

function pageFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "dad-pages-"));
  for (const file of FIXTURE_FILES) {
    const path = join(root, "content", "dad", file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "---\ntitle: Private fixture\n---\n\nPrivate text.\n");
  }
  vi.spyOn(process, "cwd").mockReturnValue(root);
});

afterEach(() => {
  cookieValue.current = undefined;
});

afterAll(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("Dad pages", () => {
  it("lists every page in the section", () => {
    const here = dirname(new URL(import.meta.url).pathname);
    const found = pageFiles(here)
      .map((path) => relative(here, path).split(sep).join("/"))
      .sort();

    expect(found).toEqual(Object.keys(PAGES).sort());
  });

  it.each(Object.keys(PAGES))(
    "%s renders nothing and reads no files without access",
    async (page) => {
      const readFile = vi.spyOn(fs, "readFileSync");
      const readDir = vi.spyOn(fs, "readdirSync");

      for (const cookie of [
        undefined,
        "authenticated",
        dadAccessToken("old-password"),
      ]) {
        cookieValue.current = cookie;
        await expect(PAGES[page]!()).resolves.toBeNull();
      }
      expect(readFile).not.toHaveBeenCalled();
      expect(readDir).not.toHaveBeenCalled();

      readFile.mockRestore();
      readDir.mockRestore();
    },
  );

  it.each(Object.keys(PAGES))(
    "%s renders for a valid signed cookie",
    async (page) => {
      cookieValue.current = dadAccessToken("correct-password");

      await expect(PAGES[page]!()).resolves.not.toBeNull();
    },
  );
});

describe("the Dad content module", () => {
  it("exports nothing that reads a file without checking access", async () => {
    const content = await import("./lib/content");

    expect(Object.keys(content)).toEqual(["dadContent"]);
  });
});
