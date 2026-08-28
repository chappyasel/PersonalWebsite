import { ExerciseDetail } from "~/app/weightlifting/[slug]/ExerciseDetail";

export const revalidate = 21600;

// The full exercise page, presented in the sheet the segment layout owns.
// The layout's <main> padding wraps the launcher, not the slot, so the
// sheet's scroller supplies its own.
export default async function InterceptedExercisePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="p-6 md:p-8">
      <ExerciseDetail slug={slug} />
    </div>
  );
}
