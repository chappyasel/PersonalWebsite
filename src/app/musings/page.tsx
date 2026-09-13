import { PenNibIcon, RssIcon } from "@phosphor-icons/react/dist/ssr";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import posts from "public/data/blog-posts.json";

import { getTimeAgo } from "~/lib/util";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyFooter from "~/components/daylight/SkyFooter";
import SkyHero from "~/components/daylight/SkyHero";
import { Card, CardContent } from "~/components/ui/card";

import TiltCard from "~/app/components/TiltCard";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Musings ~ Chappy Asel",
  description: "Essays and blog posts by Chappy Asel.",
  alternates: {
    canonical: "/musings",
    types: { "application/rss+xml": "/musings/feed.xml" },
  },
  openGraph: {
    title: "Musings ~ Chappy Asel",
    description: "Essays and blog posts by Chappy Asel.",
    url: "/musings",
    type: "website",
  },
};

export default function MusingsPage() {
  return (
    <main className="relative">
      <SkyHero>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <PenNibIcon size={28} weight="duotone" className="shrink-0" />
            <h1 className="dl-hero-title">Musings</h1>
          </div>
          <DaylightHeroMeta backHref="/">
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
          <ol aria-label="Essays" className="space-y-5">
            {posts.items.map((post) => {
              const external = !post.link.startsWith("/");
              const publishedAt = post.pubDate.includes("T")
                ? post.pubDate
                : `${post.pubDate.replace(" ", "T")}Z`;
              const exactDate = new Date(publishedAt).toLocaleDateString(
                "en-US",
                { dateStyle: "long", timeZone: "UTC" },
              );
              return (
                <li key={post.link}>
                  <TiltCard
                    interactive
                    className="relative w-full focus-within:z-10 hover:z-10"
                  >
                    <Link
                      href={post.link}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                      className="group relative block rounded-3xl [transform-style:preserve-3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                    >
                      <Card
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-3xl border-foreground/[0.06] bg-muted/40 shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)] backdrop-blur-lg transition-shadow duration-500 ease-out group-hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.1)] motion-reduce:transition-none"
                      />
                      <CardContent className="relative flex flex-col gap-5 p-5 [transform-style:preserve-3d] sm:flex-row sm:items-start sm:p-6">
                        {post.thumbnail ? (
                          <div
                            className="relative w-full shrink-0 sm:w-44"
                            style={{ transform: "translateZ(30px)" }}
                          >
                            <Image
                              src={post.thumbnail}
                              alt=""
                              width={post.thumbnailWidth}
                              height={post.thumbnailHeight}
                              sizes="(max-width: 640px) calc(100vw - 4.5rem), 176px"
                              className="aspect-[16/10] w-full rounded-2xl bg-muted object-cover shadow-[0px_4px_15px_1px_rgba(0,0,0,0.07)]"
                            />
                          </div>
                        ) : null}
                        <div
                          className="relative min-w-0 flex-1"
                          style={{ transform: "translateZ(20px)" }}
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <time dateTime={publishedAt} aria-label={exactDate}>
                              {getTimeAgo(publishedAt)}
                            </time>
                            {external ? (
                              <span>{post.source} · Featured</span>
                            ) : null}
                          </div>
                          <h2 className="text-balance font-serif text-xl font-semibold leading-snug">
                            {post.title}
                            {external ? (
                              <>
                                <ArrowUpRight
                                  aria-hidden="true"
                                  className="ml-1 inline size-4"
                                />
                                <span className="sr-only">
                                  {" "}
                                  (opens in a new tab)
                                </span>
                              </>
                            ) : null}
                          </h2>
                          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                            {post.description}
                          </p>
                        </div>
                      </CardContent>
                    </Link>
                  </TiltCard>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <SkyFooter />
    </main>
  );
}
