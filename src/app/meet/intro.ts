/**
 * The page's entrance, in two lengths. The first visit in an hour plays the
 * long one: the photo and title come in at the middle of the screen among
 * drifting blue dust, then glide up to their place as the dust gathers
 * into the page's open times, stars, meeting, and Book button, and each
 * part comes in out of its dust (MeetDust). A visit within the hour plays
 * the short one, the same arrival without the title's glide or the dust.
 * A force reload plays the long one again (forceReload), a plain reload
 * doesn't. The Owner asked for all of it on November 4, 2026, and for an
 * hour, not a day, between long ones on November 5.
 *
 * Either way the page waits at its first frame until it has hydrated and
 * measured its Days (`data-entering="wait"`), so it never shows the
 * server's guess at how many Days fit and then jumps to the real count.
 */

/** Where the browser keeps when the long entrance last played. */
const INTRO_KEY = "meet:intro";
/** The long entrance plays at most once in this long. */
const INTRO_EVERY_MS = 60 * 60 * 1000;
/** If the page hasn't hydrated by then, it shows without waiting more. */
const WAIT_MAX_MS = 5000;

/** The long entrance's beats, from hydration. */
export const INTRO = {
  /** The title has come in at the middle and starts gliding up. */
  rise: 1150,
  /** It's in its place, and the facts under it start in:
   * `--intro-landed`. */
  landed: 2050,
  /** The rest of the page starts arriving, so each part is in just as
   * its dust lands, about when the title does: `--intro` in
   * meet.module.css. */
  rest: 1450,
  /** Everything's in; later Days and steps arrive their own way. */
  done: 3300,
} as const;

/** The short entrance's length: the cascade's last Day lands by then. */
export const ENTER_MS = 1600;

/**
 * Whether the request is a force reload (⌘⇧R in Chrome, ⌥⌘R in Safari):
 * those ask past every cache with `no-cache`, where a plain reload sends
 * `max-age=0`.
 */
export function forceReload(headers: Headers): boolean {
  return (
    /\bno-cache\b/.test(headers.get("cache-control") ?? "") ||
    /\bno-cache\b/.test(headers.get("pragma") ?? "")
  );
}

/**
 * Run as the page parses, before its first paint, from inside
 * `.meet-root`: picks the long entrance when it hasn't played in an hour, or
 * on a force reload (and the browser allows motion), and lets the page
 * show anyway should it never hydrate.
 */
export const introScript = (force: boolean) => `(function () {
  var root = document.currentScript && document.currentScript.parentElement;
  if (!root) return;
  try {
    var last = Number(localStorage.getItem(${JSON.stringify(INTRO_KEY)})) || 0;
    var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still && (${force} || Date.now() - last > ${INTRO_EVERY_MS})) {
      root.setAttribute("data-intro", "");
      localStorage.setItem(${JSON.stringify(INTRO_KEY)}, String(Date.now()));
    }
  } catch (error) {}
  setTimeout(function () {
    if (root.getAttribute("data-entering") !== "wait") return;
    root.removeAttribute("data-intro");
    root.setAttribute("data-entering", "");
  }, ${WAIT_MAX_MS});
})();`;
