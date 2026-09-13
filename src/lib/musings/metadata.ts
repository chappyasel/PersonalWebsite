import type { Metadata } from "next";

import { MUSINGS_ORIGIN, type MusingArticle, musingUrl } from "./types";

export function musingMetadata(article: MusingArticle): Metadata {
  const url = musingUrl(article.slug);
  const images = article.cover
    ? [
        {
          url: `${MUSINGS_ORIGIN}${article.cover.src}`,
          width: article.cover.width,
          height: article.cover.height,
          alt: article.cover.alt || article.title,
        },
      ]
    : undefined;
  return {
    title: `${article.title} | Chappy Asel`,
    description: article.description,
    authors: [{ name: article.author }],
    alternates: {
      canonical: url,
      types: { "application/rss+xml": `${MUSINGS_ORIGIN}/musings/feed.xml` },
    },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.description,
      url,
      siteName: "Chappy Asel",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: [article.author],
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: article.title,
      description: article.description,
      images,
      creator: "@chappyasel",
    },
  };
}
export function musingStructuredData(article: MusingArticle) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    url: musingUrl(article.slug),
    mainEntityOfPage: musingUrl(article.slug),
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: article.author.split(" and ").map((name) => ({
      "@type": "Person",
      name,
      ...(name === "Chappy Asel" ? { url: MUSINGS_ORIGIN } : {}),
    })),
    ...(article.cover
      ? { image: `${MUSINGS_ORIGIN}${article.cover.src}` }
      : {}),
  }).replace(/</g, "\\u003c");
}
