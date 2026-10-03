import fs from "fs";
import matter from "gray-matter";
import path from "path";

import { hasDadAccess } from "./access";

// Build path dynamically to prevent Turbopack from statically analyzing symlinks
const contentRoot = () => path.join(process.cwd(), ...["content", "dad"]);

function readMarkdownFile(relativePath: string) {
  const fullPath = path.join(contentRoot(), relativePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  const { data: frontmatter, content: rawContent } = matter(raw);
  // Strip the leading # heading since pages render their own title from frontmatter
  const content = rawContent.replace(/^\s*#\s+.+\n*/, "");
  return { frontmatter, content };
}

// Same as readMarkdownFile but returns null instead of throwing when the file
// is missing or unreadable. Use on dynamically-rendered (on-demand) routes so
// an unknown slug yields a 404 rather than a 500.
function readMarkdownFileSafe(relativePath: string) {
  try {
    return readMarkdownFile(relativePath);
  } catch {
    return null;
  }
}

function getInsightSlugs(): string[] {
  const dir = path.join(contentRoot(), "Insights");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

function getJournalYears(): string[] {
  const dir = path.join(contentRoot(), "Journal");
  return fs
    .readdirSync(dir)
    .filter((f) => {
      const full = path.join(dir, f);
      return fs.statSync(full).isDirectory() && /^\d{4}$/.test(f);
    })
    .sort();
}

function getJournalEntries(year: string): string[] {
  const dir = path.join(contentRoot(), "Journal", year);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

function getAdjacentEntries(
  year: string,
  slug: string,
): {
  prev: { year: string; slug: string; title: string; date: string } | null;
  next: { year: string; slug: string; title: string; date: string } | null;
} {
  const years = getJournalYears();
  const allEntries: { year: string; slug: string }[] = [];

  for (const y of years) {
    const entries = getJournalEntries(y);
    for (const s of entries) {
      allEntries.push({ year: y, slug: s });
    }
  }

  const currentIndex = allEntries.findIndex(
    (e) => e.year === year && e.slug === slug,
  );

  if (currentIndex === -1) return { prev: null, next: null };

  const toEntry = (entry: { year: string; slug: string } | undefined) => {
    if (!entry) return null;
    const { frontmatter } = readMarkdownFile(
      `Journal/${entry.year}/${entry.slug}.md`,
    );
    return {
      year: entry.year,
      slug: entry.slug,
      title: (frontmatter.title as string) ?? entry.slug,
      date: (frontmatter.date as string) ?? "",
    };
  };

  return {
    prev: toEntry(allEntries[currentIndex - 1]),
    next: toEntry(allEntries[currentIndex + 1]),
  };
}

const reader = {
  readMarkdownFile,
  readMarkdownFileSafe,
  getInsightSlugs,
  getAdjacentEntries,
};

export type DadContentReader = typeof reader;

/**
 * The only way to read Dad content: the readers, or null when the request has
 * no valid signed access cookie. Every Dad page starts here and renders
 * nothing on null. The proxy and the layout's password gate also check the
 * cookie, but neither stops a page's payload on its own (ADR 0003).
 */
export async function dadContent(): Promise<DadContentReader | null> {
  return (await hasDadAccess()) ? reader : null;
}
