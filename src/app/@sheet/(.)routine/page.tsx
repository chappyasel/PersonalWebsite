import DaylightSheet from "~/components/daylight/DaylightSheet";
import RoutinePage from "~/app/routine/page";

import "~/styles/daylight.css";

// The full routine page, presented in a sheet over whatever launched it.
// Route-level CSS is imported here because this segment never passes
// through /routine's own layout.
export default function InterceptedRoutinePage() {
  return (
    <DaylightSheet label="Core Daily Routine" expandHref="/routine">
      <RoutinePage />
    </DaylightSheet>
  );
}
