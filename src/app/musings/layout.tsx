import type { ReactNode } from "react";

import "./musings.css";
import "~/styles/daylight.css";

export default function MusingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="musings-root daylight-root dl-ground-wash min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
