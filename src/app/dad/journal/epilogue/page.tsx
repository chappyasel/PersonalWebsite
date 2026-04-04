import Link from "next/link";

import { readMarkdownFile } from "~/app/dad/lib/content";
import { MarkdownRenderer } from "~/app/dad/components/MarkdownRenderer";

export default function EpiloguePage() {
  const { content } = readMarkdownFile("Journal/epilogue.md");

  return (
    <div className="py-8">
      <Link
        href="/dad"
        className="group mb-12 inline-flex items-center gap-2 font-serif text-xs uppercase tracking-[0.2em] text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">
          ←
        </span>
        Back
      </Link>

      <p className="mb-4 text-center font-serif text-[10px] uppercase tracking-[0.25em] text-muted-foreground/35">
        Afterword
      </p>

      <h1 className="mb-8 text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        Dad&apos;s Closing Reflection
      </h1>

      <MarkdownRenderer content={content} />
    </div>
  );
}
