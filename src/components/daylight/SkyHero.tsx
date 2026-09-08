import type { ReactNode } from "react";

import DaylightSky from "./DaylightSky";
import HeroParallax from "./HeroParallax";

/**
 * Full-bleed sky band shared by /routine, /manual, and /systems. Children
 * render the title row, intro, and wayfinding line inside the same column
 * grid the body uses (.dl-columns in daylight.css), so the title's left edge
 * is the section titles' left edge; the sky itself (gradient, stars, clouds,
 * skyline, haze) is DaylightSky, and HeroParallax feeds the scroll offset
 * that lets its layers part by depth.
 */
export default function SkyHero({ children }: { children: ReactNode }) {
  return (
    <header className="dl-hero" data-daylight-hero>
      <DaylightSky />
      <HeroParallax />
      <div className="dl-hero-inner dl-columns">
        <div className="dl-column">{children}</div>
      </div>
    </header>
  );
}
