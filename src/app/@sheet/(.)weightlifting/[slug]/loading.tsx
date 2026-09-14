import { Spinner } from "~/components/ui/spinner";

// Streams inside the sheet the segment layout already mounted.
export default function InterceptedExerciseLoading() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Spinner className="size-8" />
    </div>
  );
}
