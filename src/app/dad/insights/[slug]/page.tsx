import Link from "next/link";
import { notFound } from "next/navigation";

import { readMarkdownFileSafe } from "~/app/dad/lib/content";
import { MarkdownRenderer } from "~/app/dad/components/MarkdownRenderer";

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

export default async function InsightPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!SAFE_SEGMENT.test(slug)) notFound();

  const entry = readMarkdownFileSafe(`Insights/${slug}.md`);
  if (!entry) notFound();
  const { frontmatter, content } = entry;
  const title = (frontmatter.title as string) ?? slug;

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

      <h1 className="mb-8 text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>

      <MarkdownRenderer content={content} />
    </div>
  );
}
