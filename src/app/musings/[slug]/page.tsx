import { MusingBody } from "../MusingBody";
import MusingHero from "../MusingHero";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { notFound } from "next/navigation";

import { lookupInlineBooks } from "~/lib/books/inlineLookup";
import { getMusing, musings } from "~/lib/musings/content";
import { musingMetadata, musingStructuredData } from "~/lib/musings/metadata";
import { musingReadingMinutes } from "~/lib/musings/readingTime";

import SkyFooter from "~/components/daylight/SkyFooter";
import { DocumentGallery } from "~/components/images/DocumentGallery";
import SheetLink from "~/components/modal-sheet/SheetLink";

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
  const minutes = musingReadingMinutes({ searchText: article.text });
  const index = musings.findIndex((entry) => entry.slug === slug);
  const newer = musings[index - 1];
  const older = musings[index + 1];
  return (
    <main className="relative">
      <MusingHero article={{ ...article, minutes }} />
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
                      <SheetLink
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
                      </SheetLink>
                    ) : (
                      <div />
                    )}
                    {older ? (
                      <SheetLink
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
                      </SheetLink>
                    ) : null}
                  </div>
                  <SheetLink
                    href="/musings"
                    className="underline underline-offset-4"
                  >
                    All musings
                  </SheetLink>
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
