import { RssIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { MusingArticle } from "~/lib/musings/types";

import DaylightHeroMeta from "~/components/daylight/HeroMeta";
import SkyHero from "~/components/daylight/SkyHero";

export type MusingHeader = Pick<
  MusingArticle,
  "title" | "author" | "publishedAt" | "updatedAt"
> & { minutes: number | null };

const date = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));

export default function MusingHero({ article }: { article: MusingHeader }) {
  const { minutes } = article;
  return (
    <SkyHero>
      <div className="space-y-3">
        <h1 className="dl-hero-title">{article.title}</h1>
        <p className="text-sm leading-relaxed opacity-80">
          {article.author.trim() && article.author.trim() !== "Chappy Asel" ? (
            <>{article.author} · </>
          ) : null}
          <time dateTime={article.publishedAt}>
            {date(article.publishedAt)}
          </time>{" "}
          · {minutes} min read
        </p>
        {article.updatedAt.slice(0, 10) !== article.publishedAt.slice(0, 10) ? (
          <p className="text-xs opacity-70">
            Updated{" "}
            <time dateTime={article.updatedAt}>{date(article.updatedAt)}</time>
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
  );
}
