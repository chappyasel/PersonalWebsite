import { Spinner } from "~/components/ui/spinner";

// Streams inside the sheet the segment layout already mounted: the sky band
// holds the space the hero will take, the spinner sits where content lands.
export default function InterceptedRoutineLoading() {
  return (
    <div className="daylight-root dl-sheet-loading">
      <div className="dl-sheet-loading-sky" />
      <div className="dl-sheet-loading-body">
        <Spinner className="size-8" />
      </div>
    </div>
  );
}
