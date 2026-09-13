import SharedPage from "../SharedPage";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getSharePreview } from "~/lib/personalities/server/share-preview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const share = await getSharePreview(id, await headers());
  if (!share)
    return {
      title: "Link unavailable",
      description: "This shared result is unavailable or has expired.",
    };
  const labels = share.snapshot.results.map((r) => r.label);
  const title =
    labels.slice(0, 2).join(" & ") +
    (labels.length > 2 ? ` + ${labels.length - 2} more` : "");
  const description = "Big Five personality results and comparisons.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "Personalities",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await getSharePreview(id, await headers()))) notFound();
  return <SharedPage />;
}
