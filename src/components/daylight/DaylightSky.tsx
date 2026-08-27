import Image from "next/image";

import Skyline from "./Skyline";

/**
 * The daylight sky as one decorative block: the authored stacks gradient with
 * its ember glow, twinkling stars and an occasional shooting star (dark),
 * the shader-generated cloud layer with a slow drift and a passing bird
 * (light), the generated skyline silhouette, and the haze that dissolves the
 * buildings' feet into the ground. Fills its nearest positioned ancestor —
 * SkyHero puts it behind a header band, DaylightScreen behind a full screen.
 * All styling and every animation lives in src/styles/daylight.css; motion
 * respects prefers-reduced-motion there.
 */
export default function DaylightSky() {
  return (
    <div className="dl-sky" aria-hidden>
      <div className="dl-stars" />
      <div className="dl-stars-b" />
      <div className="dl-shooting-star" />
      <div className="dl-clouds">
        <Image
          src="/images/daylight-clouds.png"
          alt=""
          width={1600}
          height={342}
          priority
          className="h-auto w-full"
        />
      </div>
      <div className="dl-bird">
        <svg viewBox="0 0 24 10" width="18" height="8">
          <path
            d="M2 7 Q7 1.5 12 6 Q17 1.5 22 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="dl-sky-fade" />
      <div className="dl-skyline">
        <Skyline />
      </div>
      <div className="dl-ground-blend" />
    </div>
  );
}
