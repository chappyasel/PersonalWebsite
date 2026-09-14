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

  const displayName = resolved.allVariants
    ? resolved.entry.name
    : resolved.entry.displayName;
  const detail = await getCachedExerciseDetail(
    displayName,
    resolved.allVariants,
  );
  const title = `${displayName} ~ Chappy's Weightlifting`;
  const description = detail
    ? `${detail.instanceCount.toLocaleString()} instances and ${detail.totalSets.toLocaleString()} logged sets${resolved.allVariants ? " across all variants" : ""}${detail.best ? ` · ${Math.round(detail.best.oneRM)} lbs best est. 1RM` : ""}`
    : `Workout history for ${displayName}`;
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
