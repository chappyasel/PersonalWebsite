import Image from "next/image";
import type { ReactNode } from "react";

import Skyline from "./Skyline";

/**
 * Full-bleed sky band shared by /routine and /manual: the authored stacks sky
 * gradient with its ember glow, the shader-generated cloud layer (light theme
 * only, like the dome's own), dark-only stars, the generated skyline
 * silhouette, and a fade into the page ground. Children render the title row,
 * intro, and meta inside the content column. All styling lives in
 * src/styles/daylight.css under the .dl-* classes.
 */
export default function SkyHero({ children }: { children: ReactNode }) {
  return (
    <header className="dl-hero" data-daylight-hero>
      <div className="dl-sky" aria-hidden>
        <div className="dl-stars" />
        <div className="dl-clouds">
          <Image
            src="/images/daylight-clouds.png"
            alt=""
            width={1600}
            height={288}
            priority
            className="h-auto w-full"
          />
        </div>
        <div className="dl-sky-fade" />
        <div className="dl-skyline">
          <Skyline />
        </div>
      </div>
      <div className="dl-hero-inner">{children}</div>
    </header>
  );
}
