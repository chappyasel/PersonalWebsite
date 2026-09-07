import fs from "fs";
import matter from "gray-matter";
import path from "path";

// Build path dynamically to prevent Turbopack from statically analyzing symlinks
const CONTENT_ROOT = path.join(process.cwd(), ...["content", "dad"]);

export function readMarkdownFile(relativePath: string) {
  const fullPath = path.join(CONTENT_ROOT, relativePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  const { data: frontmatter, content: rawContent } = matter(raw);
  // Strip the leading # heading since pages render their own title from frontmatter
  const content = rawContent.replace(/^\s*#\s+.+\n*/, "");
  return { frontmatter, content };
}

// Same as readMarkdownFile but returns null instead of throwing when the file
// is missing or unreadable. Use on dynamically-rendered (on-demand) routes so
// an unknown slug yields a 404 rather than a 500.
export function readMarkdownFileSafe(relativePath: string) {
  try {
    return readMarkdownFile(relativePath);
  } catch {
    return null;
  }
}

export function getInsightSlugs(): string[] {
  const dir = path.join(CONTENT_ROOT, "Insights");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

export function getJournalYears(): string[] {
  const dir = path.join(CONTENT_ROOT, "Journal");
  return fs
    .readdirSync(dir)
    .filter((f) => {
      const full = path.join(dir, f);
      return fs.statSync(full).isDirectory() && /^\d{4}$/.test(f);
    })
    .sort();
}

export function getJournalEntries(year: string): string[] {
  const dir = path.join(CONTENT_ROOT, "Journal", year);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

export function getAdjacentEntries(
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
