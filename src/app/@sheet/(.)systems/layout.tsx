import DaylightSheet from "~/components/daylight/DaylightSheet";

import "~/styles/daylight.css";

// See (.)routine/layout.tsx — the sheet chrome mounts on navigation start,
// and loading.tsx streams a skeleton inside it while the page resolves.
export default function InterceptedSystemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DaylightSheet label="Personal Systems" expandHref="/systems">
      {children}
    </DaylightSheet>
  );
}
