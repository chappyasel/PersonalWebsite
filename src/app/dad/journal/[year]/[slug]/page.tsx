import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getAdjacentEntries,
  readMarkdownFileSafe,
} from "~/app/dad/lib/content";
import { EntryHeader } from "~/app/dad/components/EntryHeader";
import { MarkdownRenderer } from "~/app/dad/components/MarkdownRenderer";

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ year: string; slug: string }>;
}) {
  const { year, slug } = await params;
  if (!SAFE_SEGMENT.test(year) || !SAFE_SEGMENT.test(slug)) notFound();

  const entry = readMarkdownFileSafe(`Journal/${year}/${slug}.md`);
  if (!entry) notFound();
  const { frontmatter, content } = entry;
  const { prev, next } = getAdjacentEntries(year, slug);

  return (
    <div className="py-8">
      <Link
        href="/dad/journal"
        className="group mb-12 inline-flex items-center gap-2 font-serif text-xs uppercase tracking-[0.2em] text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">
          ←
        </span>
        Journal
      </Link>

      <EntryHeader frontmatter={frontmatter} />

      <MarkdownRenderer content={content} />

      <nav className="mt-20 flex items-center justify-between border-t border-muted-foreground/10 pt-8">
        {prev && (
          <Link
            href={`/dad/journal/${prev.year}/${prev.slug}`}
            className="group max-w-[45%]"
          >
            <p className="mb-1 font-serif text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40">
              Previous
            </p>
            <p className="font-serif text-base font-light italic text-foreground/70 transition-colors group-hover:text-foreground">
              {prev.title}
            </p>
          </Link>
        )}
        {next && (
          <Link
            href={`/dad/journal/${next.year}/${next.slug}`}
            className="group ml-auto max-w-[45%] text-right"
          >
            <p className="mb-1 font-serif text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40">
              Next
            </p>
            <p className="font-serif text-base font-light italic text-foreground/70 transition-colors group-hover:text-foreground">
              {next.title}
            </p>
          </Link>
        )}
      </nav>
    </div>
  );
}
