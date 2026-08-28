import type { ReactNode } from "react";

import DaylightSky from "./DaylightSky";
import HeroParallax from "./HeroParallax";

/**
 * Full-bleed sky band shared by /routine and /manual. Children render the
 * breadcrumb, title row, and intro inside the content column; the sky itself
 * (gradient, stars, clouds, skyline, haze) is DaylightSky, and HeroParallax
 * feeds the scroll offset that lets its layers part by depth.
 */
export default function SkyHero({ children }: { children: ReactNode }) {
  return (
    <header className="dl-hero" data-daylight-hero>
      <DaylightSky />
      <HeroParallax />
      <div className="dl-hero-inner">{children}</div>
    </header>
  );
}
