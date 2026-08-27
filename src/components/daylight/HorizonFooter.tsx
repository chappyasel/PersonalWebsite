/* eslint-disable @next/next/no-img-element */

/**
 * The closing horizon: the same self-contained SVG strips the flat homepage
 * footer wears (scripts/generate/skyline-silhouette.ts), standing at the very
 * bottom of a document page. Zero JS — the animations live inside the files.
 *
 * `variant="theme"` follows the theme the way the homepage footer does.
 * `variant="night"` ends the page at night in both themes — the routine's own
 * closing time — standing the dark strip on a dusk band (.dl-horizon-night)
 * that falls out of the page ground into the measured night sky.
 */
export default function HorizonFooter({
  variant = "theme",
}: {
  variant?: "theme" | "night";
}) {
  if (variant === "night") {
    return (
      <footer aria-hidden className="dl-horizon-night">
        <img src="/images/horizon-dark.svg" alt="" loading="lazy" />
      </footer>
    );
  }
  return (
    <footer aria-hidden className="w-full">
      <img
        src="/images/horizon-light.svg"
        alt=""
        loading="lazy"
        className="block w-full dark:hidden"
      />
      <img
        src="/images/horizon-dark.svg"
        alt=""
        loading="lazy"
        className="hidden w-full dark:block"
      />
    </footer>
  );
}
