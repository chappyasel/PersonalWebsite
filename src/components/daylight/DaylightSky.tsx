import GgbFireworks from "./GgbFireworks";
import Skyline from "./Skyline";

/**
 * One bird, built the way the dome shader draws it (SceneEnvironment.tsx
 * dcBirdField's SF cousin): a small body blob and four segments in a shallow
 * M — shoulder→elbow and elbow→tip per wing, so CSS can rotate the wing at
 * the shoulder and the tip at the elbow with a lag, the shader's travelling
 * wave down the wing. Rendered as a silhouette darker than the sky, never
 * brighter, which is the shader's own lesson about the ACES shoulder.
 */
function Bird() {
  return (
    <svg viewBox="0 0 24 18" width="21" height="16" className="dl-bird-glyph">
      <ellipse cx="12" cy="9" rx="1.6" ry="0.95" fill="currentColor" />
      <g className="dl-wing dl-wing-l">
        <path
          d="M12 9 L7.1 8.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <g className="dl-tip dl-tip-l">
          <path
            d="M7.1 8.2 L2.4 7.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>
      </g>
      <g className="dl-wing dl-wing-r">
        <path
          d="M12 9 L16.9 8.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <g className="dl-tip dl-tip-r">
          <path
            d="M16.9 8.2 L21.6 7.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}

/**
 * The daylight sky as one decorative block: the authored stacks gradient with
 * its ember glow, twinkling stars and an occasional shooting star (dark), the
 * shader-generated cloud layer drifting on a seamless loop with a pair of
 * flapping birds (light), the generated skyline silhouette, and the haze that
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
      <div className="dl-shooting-star" />
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
