import { WlBackLink } from "~/app/weightlifting/components/WlBackLink";
import { WorkoutPreview } from "~/app/weightlifting/components/WorkoutPreview";
import { workoutPreviewTarget } from "~/app/weightlifting/lib/workoutKey";

// The same markup as the full workout page, dressed down while in the sheet:
// the shell already provides the card chrome, so the crumb, page padding, and
// card border hide behind [data-modal-sheet] overrides. The expand takeover
// strips that attribute mid-flight and the page layout returns live — by the
// time the box reaches the viewport this IS the full page, no navigation.
export default async function InterceptedWorkoutPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return (
    <div className="mx-auto max-w-[27.5rem] space-y-3 p-6 font-sans md:p-8 [[data-modal-sheet]_&]:max-w-none [[data-modal-sheet]_&]:space-y-0 [[data-modal-sheet]_&]:p-0">
      <WlBackLink className="[[data-modal-sheet]_&]:hidden" />
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900 [[data-modal-sheet]_&]:rounded-none [[data-modal-sheet]_&]:border-0">
        <WorkoutPreview target={workoutPreviewTarget(key)} />
      </div>
    </div>
  );
}
