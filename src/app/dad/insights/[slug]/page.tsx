import Link from "next/link";

import { getInsightSlugs, readMarkdownFile } from "~/app/dad/lib/content";
import { MarkdownRenderer } from "~/app/dad/components/MarkdownRenderer";

export function generateStaticParams() {
  return getInsightSlugs().map((slug) => ({ slug }));
}

export default async function InsightPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { frontmatter, content } = readMarkdownFile(`Insights/${slug}.md`);
  const title = (frontmatter.title as string) ?? slug;

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

      <h1 className="mb-8 text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>

      <MarkdownRenderer content={content} />
    </div>
  );
}
