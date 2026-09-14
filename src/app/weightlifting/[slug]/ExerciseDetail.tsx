import { ExerciseHistory } from "../components/ExerciseHistory";
import { categoryColor } from "../lib/utils";
import { notFound } from "next/navigation";

import { resolveExercise } from "~/server/queries/resolveExercise";
import { getCachedExerciseDetail } from "~/server/queries/weightliftingExercise";

import { ExerciseExplorer } from "./ExerciseExplorer";
import { ExerciseHeader } from "./ExerciseHeader";

export { resolveExercise } from "~/server/queries/resolveExercise";

/** The exercise page's whole body, shared by the full page and the
 * intercepted sheet over the dashboard. */
export async function ExerciseDetail({ slug }: { slug: string }) {
  const resolved = await resolveExercise(slug);
  if (!resolved) notFound();
  const { entry, variants, allVariants } = resolved;
  const displayName = allVariants ? entry.name : entry.displayName;

  const detail = await getCachedExerciseDetail(displayName, allVariants);
  if (!detail) notFound();

  const color = categoryColor(detail.category);

  return (
    <div className="mx-auto max-w-4xl space-y-10 font-sans">
      <ExerciseHeader
        displayName={displayName}
        category={detail.category}
        color={color}
        firstPerformed={detail.firstPerformed}
        lastPerformed={detail.lastPerformed}
        instanceCount={detail.instanceCount}
        totalSets={detail.totalSets}
        variants={variants.map((v) => ({
          slug: v.slug,
          displayName: v.displayName,
        }))}
        currentSlug={slug}
        baseName={entry.name}
        allVariantsSlug={entry.allVariantsSlug}
        allVariants={allVariants}
      />

      {(
        allVariants
          ? variants.every((v) => v.style === "reps_weight")
          : entry.style === "reps_weight"
      ) ? (
        <ExerciseExplorer
          key={slug}
          instances={detail.instances}
          color={color}
          displayName={displayName}
          allVariants={allVariants}
        />
      ) : (
        <ExerciseHistory
          key={slug}
          displayName={displayName}
          allVariants={allVariants}
        />
      )}
    </div>
  );
}
