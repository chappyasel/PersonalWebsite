import DaylightSheet from "~/components/daylight/DaylightSheet";

import "~/styles/daylight.css";

// The sheet chrome lives in the segment LAYOUT so it mounts the instant the
// navigation starts — loading.tsx streams a skeleton inside it while the
// page (and its book-cover lookup) resolves. Route-level CSS is imported
// here because this segment never passes through /routine's own layout.
export default function InterceptedRoutineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DaylightSheet label="Core Daily Routine" expandHref="/routine">
      {children}
    </DaylightSheet>
  );
}
