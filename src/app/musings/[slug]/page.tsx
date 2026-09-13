import { MusingBody } from "../MusingBody";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { RssIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";

import { lookupInlineBooks } from "~/lib/books/inlineLookup";
import { getMusing, musings } from "~/lib/musings/content";
import { musingMetadata, musingStructuredData } from "~/lib/musings/metadata";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyFooter from "~/components/daylight/SkyFooter";
import SkyHero from "~/components/daylight/SkyHero";
import { DocumentGallery } from "~/components/images/DocumentGallery";

export const dynamicParams = false;
export function generateStaticParams() {
  return musings.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getMusing(slug);
  if (!article) notFound();
  return musingMetadata(article);
}
const date = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));

export default async function MusingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getMusing(slug);
  if (!article) notFound();
  const bookLookup = await lookupInlineBooks(
    `musings:${slug}:books`,
    article.blocks,
  );
  const minutes = Math.max(
    1,
    Math.ceil(article.text.split(/\s+/).length / 230),
  );
  const index = musings.findIndex((entry) => entry.slug === slug);
  const newer = musings[index - 1];
  const older = musings[index + 1];
  return (
    <main className="relative">
      <SkyHero>
        <div className="space-y-3">
          <h1 className="dl-hero-title">{article.title}</h1>
          <p className="text-sm leading-relaxed opacity-80">
            {article.author.trim() &&
            article.author.trim() !== "Chappy Asel" ? (
              <>{article.author} · </>
            ) : null}
            <time dateTime={article.publishedAt}>
              {date(article.publishedAt)}
            </time>{" "}
            · {minutes} min read
          </p>
          {article.updatedAt.slice(0, 10) !==
          article.publishedAt.slice(0, 10) ? (
            <p className="text-xs opacity-70">
              Updated{" "}
              <time dateTime={article.updatedAt}>
                {date(article.updatedAt)}
              </time>
            </p>
          ) : null}
          <DaylightHeroMeta
            backHref="/musings"
            backLabel="Back to Musings"
            additionalLinks={
              <Link
                href="/"
                prefetch={false}
                className="transition-colors hover:text-[hsl(var(--dl-sky-ink))]"
              >
                chappyasel.com
              </Link>
            }
          >
            <a
              href="/musings/feed.xml"
              className="flex items-center gap-1.5 transition-colors hover:text-[hsl(var(--dl-sky-ink))]"
            >
              <RssIcon size={12} aria-hidden /> RSS feed
            </a>
          </DaylightHeroMeta>
        </div>
      </SkyHero>
      <div className="dl-columns mt-8 px-4 pb-16">
        <div className="dl-column">
          <DocumentGallery key={slug}>
            <article>
              <div className="prose prose-lg max-w-none break-words dark:prose-invert prose-headings:font-serif prose-headings:font-medium prose-p:leading-relaxed prose-a:text-foreground prose-a:decoration-muted-foreground/50 prose-a:underline-offset-4 prose-blockquote:font-normal prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-muted-foreground prose-img:my-0">
                <MusingBody blocks={article.blocks} bookLookup={bookLookup} />
              </div>
              <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
                <nav aria-label="Article navigation">
                  <div className="mb-6 grid gap-6 sm:grid-cols-2">
                    {newer ? (
                      <Link
                        href={`/musings/${newer.slug}`}
                        rel="prev"
                        className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="text-xs">
                          <ArrowLeftIcon
                            aria-hidden="true"
                            className="inline-block size-[1em] align-[-0.125em]"
                          />{" "}
                          Newer essay
                        </span>
                        <span className="mt-1 block font-serif text-lg text-foreground hover:underline">
                          {newer.title}
                        </span>
                      </Link>
                    ) : (
                      <div />
                    )}
                    {older ? (
                      <Link
                        href={`/musings/${older.slug}`}
                        rel="next"
                        className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-right"
                      >
                        <span className="text-xs">
                          Older essay{" "}
                          <ArrowRightIcon
                            aria-hidden="true"
                            className="inline-block size-[1em] align-[-0.125em]"
                          />
                        </span>
                        <span className="mt-1 block font-serif text-lg text-foreground hover:underline">
                          {older.title}
                        </span>
                      </Link>
                    ) : null}
                  </div>
                  <Link
                    href="/musings"
                    className="underline underline-offset-4"
                  >
                    All musings
                  </Link>
                </nav>
              </footer>
            </article>
          </DocumentGallery>
        </div>
      </div>
      <SkyFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: musingStructuredData(article) }}
      />
    </main>
  );
}
