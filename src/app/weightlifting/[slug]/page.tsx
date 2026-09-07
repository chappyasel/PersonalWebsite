import { type Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getCachedExerciseDetail,
  getCachedExerciseIndex,
} from "~/server/queries/weightliftingExercise";

import { ExerciseDetail, resolveExercise } from "./ExerciseDetail";

export const revalidate = 21600;

export async function generateStaticParams() {
  // A transient query failure here must not fail the whole deploy; pages
  // then build on demand instead
  try {
    const index = await getCachedExerciseIndex();
    return index.map((e) => ({ slug: e.slug }));
  } catch (error) {
    console.error("exercise generateStaticParams failed:", error);
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveExercise(slug);
  // Throwing here (not in the page body) matters: metadata resolves before
  // the response streams, so the visitor gets a real 404 status instead of
  // a 200 with 404 UI injected mid-stream.
  if (!resolved) notFound();

  const detail = await getCachedExerciseDetail(resolved.entry.displayName);
  const title = `${resolved.entry.displayName} ~ Chappy's Weightlifting`;
  const description = detail
    ? `${Math.round(resolved.entry.bestOneRM)} lbs best est. 1RM across ${detail.totalSets.toLocaleString()} logged sets`
    : `${Math.round(resolved.entry.bestOneRM)} lbs best est. 1RM`;
  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: { title, description, url: `/${slug}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ExerciseDetail slug={slug} />;
}
