import DaylightSky from "./DaylightSky";

/**
 * The hero's sky closing the page instead of opening it — the same
 * DaylightSky in a fixed-height band, so both horizons share geometry,
 * palette, motion, and the phone-width panning strip (.dl-band rules).
 *
 * `night` ends the page at 9:15pm in both themes: a local `.dark` scope with
 * its own .daylight-root re-resolves every dark token and fires every night
 * gate in daylight.css (windows, Bay Lights, lamps, beacons, crown, moon,
 * satellite, shooting star) off the ancestor class exactly as the html class
 * does. Both wrappers are display:contents, so DaylightSky's absolute layers
 * still fill .dl-band. The feather stays outside that scope on purpose — a
 * night band on the light page hands off from the light page's own arc.
 */
export default function SkyFooter({ night = false }: { night?: boolean }) {
  return (
    <footer className="dl-band" aria-hidden>
      {night ? (
        <div className="dark contents">
          <div className="daylight-root contents">
            <DaylightSky />
          </div>
        </div>
      ) : (
        <DaylightSky />
      )}
      <div className="dl-band-feather" />
    </footer>
  );
}
