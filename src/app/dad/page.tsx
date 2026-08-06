import Link from "next/link";

import { getInsightSlugs, readMarkdownFile } from "./lib/content";

export default async function DadPage() {
  // Access is enforced server-side in the dad layout.
  // Build the insight list with titles from frontmatter
  const slugs = getInsightSlugs().filter((s) => s !== "00-life-story" && s !== "bio-updates-draft");
  const insights = slugs.map((slug) => {
    const { frontmatter } = readMarkdownFile(`Insights/${slug}.md`);
    return {
      slug,
      title: (frontmatter.title as string) ?? slug,
    };
  });

  return (
    <div className="mx-auto max-w-2xl py-12 sm:py-20">
      {/* Frontispiece */}
      <div className="mb-20 text-center">
        <p className="mb-4 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Reflections on a Young Life
        </p>
        <h1 className="mb-2 text-5xl font-light italic tracking-wide text-foreground sm:text-6xl">
          Dad&apos;s Journal
        </h1>
        <div className="mx-auto my-5 w-12 border-t border-muted-foreground/20" />
        <p className="text-xl font-light text-foreground">
          Gabriel Chapman Asel
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          April 1999 &ndash; December 2024
        </p>
      </div>

      {/* Navigation sections */}
      <div className="space-y-16">
        {/* Life Story */}
        <section>
          <h2 className="mb-6 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            I. Life Story
          </h2>
          <Link
            href="/dad/life-story"
            className="group flex items-baseline justify-between border-b border-muted-foreground/10 py-3 transition-colors hover:border-muted-foreground/20"
          >
            <span className="font-serif text-lg font-light text-foreground transition-transform duration-200 group-hover:translate-x-1">
              Life Story
            </span>
            <span className="font-serif text-xs text-muted-foreground group-hover:text-foreground">
              A narrative weaving the journal into a coming-of-age story
            </span>
          </Link>
        </section>

        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-muted-foreground/10" />
          <span className="text-[10px] text-muted-foreground/25">·</span>
          <div className="flex-1 border-t border-muted-foreground/10" />
        </div>

        {/* Insights */}
        <section>
          <h2 className="mb-6 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            II. Insights
          </h2>
          <div>
            {insights.map(({ slug, title }) => (
              <Link
                key={slug}
                href={`/dad/insights/${slug}`}
                className="group flex items-baseline justify-between border-b border-muted-foreground/10 py-3 transition-colors hover:border-muted-foreground/20"
              >
                <span className="font-serif text-lg font-light text-foreground transition-transform duration-200 group-hover:translate-x-1">
                  {title}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-muted-foreground/10" />
          <span className="text-[10px] text-muted-foreground/25">·</span>
          <div className="flex-1 border-t border-muted-foreground/10" />
        </div>

        {/* Journal */}
        <section>
          <h2 className="mb-6 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            III. The Journal
          </h2>
          <div>
            <Link
              href="/dad/journal/preface"
              className="group mb-2 block text-sm italic text-muted-foreground transition-colors hover:text-foreground"
            >
              Dad&apos;s Opening Letter
            </Link>
            <Link
              href="/dad/journal"
              className="group flex items-baseline justify-between border-b border-muted-foreground/10 py-3 transition-colors hover:border-muted-foreground/20"
            >
              <span className="font-serif text-lg font-light text-foreground transition-transform duration-200 group-hover:translate-x-1">
                Journal Index
              </span>
              <span className="font-serif text-xs text-muted-foreground group-hover:text-foreground">
                311 entries spanning 25 years
              </span>
            </Link>
            <Link
              href="/dad/journal/epilogue"
              className="group mt-2 block text-sm italic text-muted-foreground transition-colors hover:text-foreground"
            >
              Dad&apos;s Closing Reflection
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
