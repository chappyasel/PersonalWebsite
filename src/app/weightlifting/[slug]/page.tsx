import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCachedExerciseDetail,
  getCachedExerciseIndex,
  getFreshExerciseIndex,
} from "~/server/queries/weightliftingExercise";
import { categoryColor } from "../lib/utils";
import { ordinalDate } from "../lib/wlaFormat";
import { ExerciseExplorer } from "./ExerciseExplorer";
import { VariationPicker } from "./VariationPicker";

export const revalidate = 21600;

async function resolveExercise(slug: string) {
  const index = await getCachedExerciseIndex();
  const entry = index.find((e) => e.slug === slug);
  if (entry) return { entry, index };
  // A stale-while-revalidate read right after a sync can miss a newly
  // eligible exercise; check the database directly before 404ing
  try {
    const fresh = await getFreshExerciseIndex();
    const freshEntry = fresh.find((e) => e.slug === slug);
    if (freshEntry) return { entry: freshEntry, index: fresh };
  } catch {
    // fall through to the 404
  }
  return null;
}

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
  const resolved = await resolveExercise(slug);
  if (!resolved) notFound();
  const { entry, index } = resolved;

  const detail = await getCachedExerciseDetail(entry.displayName);
  if (!detail) notFound();

  // Iterations of the same exercise type (the app's pencil-menu switcher)
  const variants = index
    .filter((e) => e.name === entry.name)
    .sort((a, b) => b.setCount - a.setCount);

  const color = categoryColor(detail.category);

  return (
    <div className="mx-auto max-w-4xl space-y-10 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/weightlifting"
          className="text-sm text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          ← Chappy&apos;s Weightlifting
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex items-center gap-3 font-rounded text-2xl font-semibold text-foreground md:text-4xl">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            {detail.displayName}
          </h1>
          {variants.length > 1 && (
            <VariationPicker
              variants={variants}
              currentSlug={slug}
              baseName={entry.name}
              color={color}
            />
          )}
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {detail.category} · {ordinalDate(detail.firstPerformed)} –{" "}
          {ordinalDate(detail.lastPerformed)} ·{" "}
          {detail.instanceCount.toLocaleString()} instances ·{" "}
          {detail.totalSets.toLocaleString()} sets
        </p>
      </div>

      {/* App-parity explorer: sort picker, podium, graph, show more, instances */}
      <ExerciseExplorer instances={detail.instances} color={color} />
    </div>
  );
}
