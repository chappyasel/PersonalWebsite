import { WorkoutPreview } from "~/app/weightlifting/components/WorkoutPreview";
import { workoutPreviewTarget } from "~/app/weightlifting/lib/workoutKey";

// The preview keeps the old modal's white card ground — the sheet shell's
// bg-background is the page gray, and the set chips need white behind them.
export default async function InterceptedWorkoutPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return (
    <div className="min-h-full bg-white dark:bg-neutral-900">
      <WorkoutPreview target={workoutPreviewTarget(key)} />
    </div>
  );
}
