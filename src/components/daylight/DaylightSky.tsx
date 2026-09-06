import GgbFireworks from "./GgbFireworks";
import ShootingStar from "./ShootingStar";
import Skyline from "./Skyline";

/** A small side-profile gull matching the dome shader. The body always points
 * along the route while one visible wing articulates at shoulder and wrist. */
function Bird() {
  return (
    <svg viewBox="0 0 24 18" width="21" height="16" className="dl-bird-glyph">
      <path
        className="dl-bird-body"
        d="M5.6 8.75 2.2 7.05l1.65 1.9-1.45 1.9 3.45-1.3c2.7 1 6.55 1.2 9.7.35 1.2-.3 2.15-.4 2.8-.85l3.45-.25-3.15-.95c-.7-.8-1.8-.95-2.9-.3-3.45-.65-7.15-.45-10.15.75z"
        fill="currentColor"
      />
      <g className="dl-wing dl-wing-l">
        <path
          d="M11.4 8.45C9.7 7.45 7.9 7.15 6.55 7.75c.85 1.45 2.75 2.35 4.85 1.65z"
          fill="currentColor"
        />
        <g className="dl-tip dl-tip-l">
          <path
            d="M6.7 7.55C4.55 6.35 2.3 6.2.5 7.05c1.55 1.55 3.75 2.45 6.3 1.75-.42-.42-.45-.84-.1-1.25z"
            fill="currentColor"
          />
        </g>
      </g>
    </svg>
  );
}

/**
 * The daylight sky as one decorative block: the authored stacks gradient with
 * its ember glow, twinkling stars and an occasional shooting star (dark), the
 * shader-generated cloud layer drifting on a seamless loop with a variable
 * flock of birds (light), the generated skyline silhouette, and the haze that
 * dissolves the buildings' feet into the ground. Fills its nearest positioned
 * ancestor — SkyHero puts it behind a header band, the 404/error screens
 * behind a full screen. All styling and every animation lives in
 * src/styles/daylight.css; motion respects prefers-reduced-motion there.
 */
export default function DaylightSky() {
  return (
    <div className="dl-sky" aria-hidden>
      <div className="dl-stars" />
      <div className="dl-stars-b" />
      <ShootingStar />
      <div className="dl-satellite" />
      {/* The cloud layer is pure CSS — a repeat-x background on ::before —
          so there is no image element to lazy-load or run out of. */}
      <div className="dl-clouds" />
      <div className="dl-birds">
        <div className="dl-bird dl-bird-a">
          <Bird />
        </div>
        <div className="dl-bird dl-bird-b">
          <Bird />
        </div>
        <div className="dl-bird dl-bird-c">
          <Bird />
        </div>
        <div className="dl-bird dl-bird-d">
          <Bird />
        </div>
      </div>
      <div className="dl-sky-fade" />
      <div className="dl-skyline">
        <Skyline />
      </div>
      <div className="dl-ground-blend" />
      <GgbFireworks />
    </div>
  );
}
