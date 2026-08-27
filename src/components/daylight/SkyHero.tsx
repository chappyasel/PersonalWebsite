import type { ReactNode } from "react";

import DaylightSky from "./DaylightSky";

/**
 * Full-bleed sky band shared by /routine and /manual. Children render the
 * breadcrumb, title row, and intro inside the content column; the sky itself
 * (gradient, stars, clouds, skyline, haze) is DaylightSky.
 */
export default function SkyHero({ children }: { children: ReactNode }) {
  return (
    <header className="dl-hero" data-daylight-hero>
      <DaylightSky />
      <div className="dl-hero-inner">{children}</div>
    </header>
  );
}
