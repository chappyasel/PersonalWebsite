import type { Metadata, ResolvingMetadata } from "next";

import { getSectionPreview } from "./sectionPreviews.server";
import type { SectionSharePage } from "./sectionShare";

export type SectionSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export async function sectionMetadata(
  page: SectionSharePage,
  searchParams: SectionSearchParams,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const section = getSectionPreview(page, (await searchParams).section);
  // Inherit the layout's normal preview for absent, repeated, or unknown ids.
  if (!section) return {};

  const inherited = await parent;
  const base = inherited.metadataBase ?? new URL("https://www.chappyasel.com");
  const canonical = inherited.alternates?.canonical?.url ?? `/${page}`;
  const shareUrl = new URL(canonical, base);
  shareUrl.search = "";
  shareUrl.searchParams.set("section", section.id);
  shareUrl.hash = "";
  const imageUrl = new URL("/api/og/section", base);
  imageUrl.searchParams.set("page", page);
  imageUrl.searchParams.set("section", section.id);
  const images = [
    { url: imageUrl.href, width: 1200, height: 630, alt: section.title },
  ];

  return {
    title: { absolute: section.title },
    description: section.description,
    openGraph: {
      ...inherited.openGraph,
      title: section.title,
      description: section.description,
      url: shareUrl.href,
      images,
    },
    twitter: {
      site: inherited.twitter?.site ?? undefined,
      creator: inherited.twitter?.creator ?? undefined,
      card: "summary_large_image",
      title: section.title,
      description: section.description,
      images,
    },
    // The layout's search canonical still identifies the complete document.
  };
}
