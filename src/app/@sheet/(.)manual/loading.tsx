import { Spinner } from "~/components/ui/spinner";

// See (.)routine/loading.tsx.
export default function InterceptedManualLoading() {
  return (
    <div className="daylight-root dl-sheet-loading">
      <div className="dl-sheet-loading-sky" />
      <div className="dl-sheet-loading-body">
        <Spinner className="size-8" />
      </div>
    </div>
  );
}
