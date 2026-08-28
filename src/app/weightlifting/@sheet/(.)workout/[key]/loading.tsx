import { Spinner } from "~/components/ui/spinner";

// Streams inside the card the segment layout already mounted.
export default function InterceptedWorkoutLoading() {
  return (
    <div className="flex items-center justify-center bg-white p-12 dark:bg-neutral-900">
      <Spinner className="size-8" />
    </div>
  );
}
