import Skyline from "./Skyline";

/**
 * The quiet horizon that closes a daylight page: the surveyed silhouette
 * standing directly on the page's own ground, the same way the flat homepage
 * footer closes that page. No sky band, no backdrop of its own — in light it
 * is the fog-washed city and the red bridge on the paper; in dark the
 * buildings nearly dissolve into the ground and the window lights, deck
 * lamps, beacons, and moon carry it. On phones the strip keeps the hero's
 * min-width overhang and slow pan so the city stays legible.
 */
export default function SkyFooter() {
  return (
    <footer className="dl-horizon" aria-hidden>
      <div className="dl-horizon-strip">
        <Skyline />
      </div>
    </footer>
  );
}
