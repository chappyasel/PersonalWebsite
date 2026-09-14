import "server-only";

import {
  type ExerciseDirectoryEntry,
  exerciseHistorySlug,
  getCachedExerciseDirectory,
  getFreshExerciseDirectory,
} from "./exerciseDirectory";

function findExercise(index: ExerciseDirectoryEntry[], slug: string) {
  const entry = index.find(
    (e) =>
      e.slug === slug ||
      e.allVariantsSlug === slug ||
      exerciseHistorySlug(e.displayName) === slug,
  );
  if (!entry) return null;
  return {
    entry,
    allVariants: entry.allVariantsSlug === slug,
    variants: index
      .filter((e) => e.name === entry.name)
      .sort((a, b) => b.instanceCount - a.instanceCount),
  };
}

export async function resolveExercise(slug: string) {
  const cached = findExercise(await getCachedExerciseDirectory(), slug);
  if (cached) return cached;
  // A tag-invalidated cache can serve one stale read immediately after sync.
  try {
    return findExercise(await getFreshExerciseDirectory(), slug);
  } catch {
    return null;
  }
}
