import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { MarkdownRenderer } from "~/app/dad/components/MarkdownRenderer";
import { readMarkdownFile } from "~/app/dad/lib/content";

export default function LifeStoryPage() {
  const { frontmatter, content } = readMarkdownFile(
    "Insights/00-life-story.md",
  );
  const title = (frontmatter.title as string) ?? "Life Story";

  return (
    <div className="py-8">
      <Link
        href="/dad"
        className="group mb-12 inline-flex items-center gap-2 font-serif text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">
          <ArrowLeftIcon
            aria-hidden="true"
            className="inline-block size-[1em] align-[-0.125em]"
          />
        </span>
        Back
      </Link>
      <div className="mb-10 text-center">
        <h1 className="font-serif text-4xl font-light italic tracking-wide text-foreground sm:text-5xl">
          {title}
        </h1>
      </div>
      <MarkdownRenderer content={content} />
    </div>
  );
}
