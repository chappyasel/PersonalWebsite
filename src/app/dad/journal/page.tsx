import Link from "next/link";

import { readMarkdownFile } from "~/app/dad/lib/content";
import { MarkdownRenderer } from "~/app/dad/components/MarkdownRenderer";

export default function JournalIndexPage() {
  const { content } = readMarkdownFile("Journal/index.md");

  return (
    <div className="py-8">
      <Link
        href="/dad"
        className="group mb-12 inline-flex items-center gap-2 font-serif text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">
          ←
        </span>
        Back
      </Link>
      <MarkdownRenderer content={content} />
    </div>
  );
}
