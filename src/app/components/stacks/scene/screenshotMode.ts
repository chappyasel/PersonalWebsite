// Screenshot mode: the owner's still-frame setup for social headers.
//
// LinkedIn (1584x396) and X (1500x500) banners are three to four times
// wider than they are tall. At that aspect the ordinary About stop shows
// the Books unit on the right and a stretch of couch on the left, the rail
// and dock cover the ends of the frame, and the pointer parallax moves the
// shelf by up to half a unit depending on where the mouse happens to rest.
// None of that belongs in a header. This mode turns all of it off at once:
//
//  - every unit except About is made cold, so the shelf stands alone;
//  - the interface is hidden with the same attribute the H key uses;
//  - the About stop drops its rail shift and the pointer parallax reads a
//    centred pointer, so the shelf sits in the middle of the viewport;
//  - the camera can dolly back past the visitor's zoom floor, and the lens
//    can be narrowed or widened, so the shelf can be made as small in the
//    frame as the banner wants;
//  - the render lands on Cinematic+ unless the URL asks for another
//    quality, because a still frame has no frame budget to protect;
//  - the About shelf is restaged (UnitAbout.tsx, Scene.tsx): the Projects
//    Macintosh running Life stands where the large portrait does, because
//    the profile picture already sits beside a header on both networks; the
//    reading stack shows the first three featured books instead of the
//    current reads; the couch and the seam monstera behind the shelf go.
//
// The mode is a session-only override like every other diagnostics switch:
// `?screenshot=1` seeds it at load, the Scene console flips it live, and a
// reload without the parameter returns the ordinary room. It changes no
// production quality policy and awards no Field Note; a visitor never sees
// it unless they type the parameter, and it is not a discovery.
//
// Dependency-free on purpose: the chrome (ChromeKeyboard, the diagnostics
// registry) and the scene both read it, and the DOM side must not import
// three.
import { useSyncExternalStore } from "react";

export const SCREENSHOT_PARAM = "screenshot";
export const SCREENSHOT_DOLLY_PARAM = "screenshot-dolly";
export const SCREENSHOT_FOV_PARAM = "screenshot-fov";
export const SCREENSHOT_QUERY_KEYS = [
  SCREENSHOT_PARAM,
  SCREENSHOT_DOLLY_PARAM,
  SCREENSHOT_FOV_PARAM,
] as const;

/** The unit that stays on screen. Always About: the header is a portrait
 * of the person, and About is the shelf that says who he is. */
export const SCREENSHOT_UNIT = 0;

/** World units the camera stands back from its authored stop. The visitor's
 * zoom floor is 0.75; a 4:1 banner wants far more air than that. At the
 * default lens the frame is 0.59 units tall per unit of distance, so eight
 * units back puts the two-unit shelf at roughly a quarter of the frame's
 * height; smaller than that it stops reading as a shelf. */
export const SCREENSHOT_DOLLY_MIN = 0;
export const SCREENSHOT_DOLLY_MAX = 8;
export const SCREENSHOT_DOLLY_STEP = 0.25;
export const SCREENSHOT_DOLLY_DEFAULT = 0;

/** Vertical field of view in degrees, or null for the composition's own lens
 * (33 on desktop). The same window the OG capture allows itself. */
export const SCREENSHOT_FOV_MIN = 24;
export const SCREENSHOT_FOV_MAX = 45;

export type ScreenshotModeSnapshot = Readonly<{
  enabled: boolean;
  dolly: number;
  fov: number | null;
}>;

export const SCREENSHOT_MODE_DEFAULT: ScreenshotModeSnapshot = Object.freeze({
  enabled: false,
  dolly: SCREENSHOT_DOLLY_DEFAULT,
  fov: null,
});

export function clampScreenshotDolly(dolly: number) {
  if (!Number.isFinite(dolly)) return SCREENSHOT_DOLLY_DEFAULT;
  return Math.min(SCREENSHOT_DOLLY_MAX, Math.max(SCREENSHOT_DOLLY_MIN, dolly));
}

/** Out-of-range and unreadable values mean "no override", never a clamp: a
 * mistyped lens should fall back to the real one rather than pin the camera
 * to whichever bound it happened to be nearer. */
export function screenshotFovFromValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const fov = Number(value);
  return Number.isFinite(fov) &&
    fov >= SCREENSHOT_FOV_MIN &&
    fov <= SCREENSHOT_FOV_MAX
    ? fov
    : null;
}

export function screenshotModeFromSearch(
  search: string | URLSearchParams,
): ScreenshotModeSnapshot {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const raw = params.get(SCREENSHOT_PARAM);
  const enabled = raw !== null && raw !== "0" && raw !== "false";
  if (!enabled) return SCREENSHOT_MODE_DEFAULT;
  const dollyRaw = params.get(SCREENSHOT_DOLLY_PARAM);
  return {
    enabled,
    dolly:
      dollyRaw === null
        ? SCREENSHOT_DOLLY_DEFAULT
        : clampScreenshotDolly(Number(dollyRaw)),
    fov: screenshotFovFromValue(params.get(SCREENSHOT_FOV_PARAM)),
  };
}

/** Whether the URL itself pins a render quality. The mode only lands on
 * Cinematic+ when it does not, so `?screenshot=1&quality=cinematic` still
 * means what it says. */
export function searchPinsQuality(search: string | URLSearchParams) {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get("quality") !== null;
}

/** The URL that reproduces the current setup, for pasting into a note or a
 * second browser sized for the other network. */
export function screenshotModeUrl(
  href: string,
  snapshot: ScreenshotModeSnapshot,
) {
  const url = new URL(href);
  for (const key of SCREENSHOT_QUERY_KEYS) url.searchParams.delete(key);
  if (snapshot.enabled) {
    url.searchParams.set(SCREENSHOT_PARAM, "1");
    if (snapshot.dolly !== SCREENSHOT_DOLLY_DEFAULT)
      url.searchParams.set(SCREENSHOT_DOLLY_PARAM, String(snapshot.dolly));
    if (snapshot.fov !== null)
      url.searchParams.set(SCREENSHOT_FOV_PARAM, String(snapshot.fov));
  }
  return url.toString();
}

/** One keydown's effect on the dolly while the mode is on. `[` steps back,
 * `]` steps in, Shift takes four steps at once. Anything else, or any event
 * the chrome keys would already refuse, is null. */
export function screenshotDollyKeyDelta(event: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  editableTarget: boolean;
}): number | null {
  if (event.defaultPrevented || event.editableTarget) return null;
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  const step = event.shiftKey
    ? SCREENSHOT_DOLLY_STEP * 4
    : SCREENSHOT_DOLLY_STEP;
  // Shift+[ arrives as "{" on US layouts; accept both spellings so the
  // modifier only changes the size of the step.
  if (event.key === "[" || event.key === "{") return step;
  if (event.key === "]" || event.key === "}") return -step;
  return null;
}

class ScreenshotModeController {
  private snapshot: ScreenshotModeSnapshot = SCREENSHOT_MODE_DEFAULT;
  private listeners = new Set<() => void>();

  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(next: ScreenshotModeSnapshot) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  setEnabled(enabled: boolean) {
    if (this.snapshot.enabled === enabled) return;
    this.publish({ ...this.snapshot, enabled });
  }

  setDolly(dolly: number) {
    const next = clampScreenshotDolly(dolly);
    if (this.snapshot.dolly === next) return;
    this.publish({ ...this.snapshot, dolly: next });
  }

  nudgeDolly(delta: number) {
    this.setDolly(this.snapshot.dolly + delta);
  }

  setFov(fov: number | null) {
    const next = screenshotFovFromValue(fov);
    if (this.snapshot.fov === next) return;
    this.publish({ ...this.snapshot, fov: next });
  }

  /** Seed from the URL once, at canvas mount. Later reads come from the
   * live snapshot so the console can change it without a reload. */
  seed(snapshot: ScreenshotModeSnapshot) {
    this.publish(snapshot);
  }

  /** Session-only, like every other diagnostics override. */
  reset() {
    this.publish(SCREENSHOT_MODE_DEFAULT);
  }
}

export const screenshotModeController = new ScreenshotModeController();

export function useScreenshotMode() {
  return useSyncExternalStore(
    screenshotModeController.subscribe,
    screenshotModeController.getSnapshot,
    () => SCREENSHOT_MODE_DEFAULT,
  );
}
