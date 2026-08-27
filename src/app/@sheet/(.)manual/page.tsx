import DaylightSheet from "~/components/daylight/DaylightSheet";
import ManualPage from "~/app/manual/page";

import "~/styles/daylight.css";

// The full manual page, presented in a sheet over whatever launched it.
export default function InterceptedManualPage() {
  return (
    <DaylightSheet label="Personal Operating Manual">
      <ManualPage />
    </DaylightSheet>
  );
}
