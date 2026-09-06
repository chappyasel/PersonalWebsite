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
//    frame as the banner wants; it opens at the 45 degree lens with the
//    lawn lifted 0.06 and fully uneven, the setup the owner keeps returning
//    to, so `?screenshot=1` alone is the header;
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
export const SCREENSHOT_GRASS_LIFT_PARAM = "screenshot-grass-lift";
export const SCREENSHOT_GRASS_VARIATION_PARAM = "screenshot-grass-variation";
export const SCREENSHOT_PORTRAIT_PARAM = "screenshot-portrait";
export const SCREENSHOT_QUERY_KEYS = [
  SCREENSHOT_PARAM,
  SCREENSHOT_DOLLY_PARAM,
  SCREENSHOT_FOV_PARAM,
  SCREENSHOT_GRASS_LIFT_PARAM,
  SCREENSHOT_GRASS_VARIATION_PARAM,
  SCREENSHOT_PORTRAIT_PARAM,
] as const;

/** The unit that stays on screen. Always About: the header is a portrait
 * of the person, and About is the shelf that says who he is. */
export const SCREENSHOT_UNIT = 0;

/** World units the camera stands back from its authored stop. The visitor's
 * zoom floor is 0.75; a 4:1 banner wants far more air than that. At the
 * default lens the frame is 0.59 units tall per unit of distance, so eight
 * units back puts the two-unit shelf at roughly a quarter of the frame's
 * height. Negative dollies step in closer than the stop (which stands about
 * 5.8 units off the shelf, so -3 is still outside it). Both ends were pushed
 * out once the owner found the defaults sitting on the limits (2026-09-06):
 * a range exists to be moved through, so every default sits inside it. */
export const SCREENSHOT_DOLLY_MIN = -3;
export const SCREENSHOT_DOLLY_MAX = 12;
export const SCREENSHOT_DOLLY_STEP = 0.25;
export const SCREENSHOT_DOLLY_DEFAULT = 0;

/** Vertical field of view in degrees, or null for the composition's own lens
 * (33 on desktop). The same window the OG capture allows itself. The mode
 * opens at the wide end: the owner settled on 45 for the headers
 * (2026-09-06), and `?screenshot-fov=composition` asks for the room's lens. */
export const SCREENSHOT_FOV_MIN = 24;
export const SCREENSHOT_FOV_MAX = 65;
export const SCREENSHOT_FOV_DEFAULT = 45;
export const SCREENSHOT_FOV_COMPOSITION = "composition";

/** The still's lawn: how much taller the grass stands away from the About
 * shelf's footprint, and how much more uneven it is everywhere, both as
 * fractions of the authored height. The defaults are the owner's header
 * setup (2026-09-06). Variation stops at 1: the blade height is scaled by
 * `1 + variation * (rand in -1..1)` in meadowField.ts, and past 1 the
 * shortest blades would turn inside out. Lift has no such ceiling; 2 is
 * three times the authored height at the edges of the frame. */
export const SCREENSHOT_GRASS_MAX = 1;
export const SCREENSHOT_GRASS_LIFT_MAX = 2;
export const SCREENSHOT_GRASS_STEP = 0.02;
export const SCREENSHOT_GRASS_LIFT_DEFAULT = 0.06;
export const SCREENSHOT_GRASS_VARIATION_DEFAULT = 0.6;

export type ScreenshotModeSnapshot = Readonly<{
  enabled: boolean;
  dolly: number;
  fov: number | null;
  grassLift: number;
  grassVariation: number;
  /** Keep the large portrait on the top shelf instead of the header's
   * Macintosh. Off for the social headers, where the profile picture already
   * sits beside the image; on for a card that stands alone, like the OG
   * image, where the portrait is the only face in the frame. */
  portrait: boolean;
}>;

export const SCREENSHOT_MODE_DEFAULT: ScreenshotModeSnapshot = Object.freeze({
  enabled: false,
  dolly: SCREENSHOT_DOLLY_DEFAULT,
  fov: SCREENSHOT_FOV_DEFAULT,
  grassLift: SCREENSHOT_GRASS_LIFT_DEFAULT,
  grassVariation: SCREENSHOT_GRASS_VARIATION_DEFAULT,
  portrait: false,
});

function screenshotFlagFromValue(raw: string | null) {
  return raw !== null && raw !== "0" && raw !== "false";
}

export function clampScreenshotDolly(dolly: number) {
  if (!Number.isFinite(dolly)) return SCREENSHOT_DOLLY_DEFAULT;
  return Math.min(SCREENSHOT_DOLLY_MAX, Math.max(SCREENSHOT_DOLLY_MIN, dolly));
}

export function clampScreenshotGrass(
  value: number,
  fallback: number,
  max = SCREENSHOT_GRASS_MAX,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(0, value));
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
  const enabled = screenshotFlagFromValue(params.get(SCREENSHOT_PARAM));
  if (!enabled) return SCREENSHOT_MODE_DEFAULT;
  const dollyRaw = params.get(SCREENSHOT_DOLLY_PARAM);
  const grass = (key: string, fallback: number, max: number) => {
    const raw = params.get(key);
    return raw === null
      ? fallback
      : clampScreenshotGrass(Number(raw), fallback, max);
  };
  // A lens the URL leaves out, or mistypes, is the default one; only the
  // word "composition" asks for the room's own lens.
  const fovRaw = params.get(SCREENSHOT_FOV_PARAM);
  const fov =
    fovRaw === SCREENSHOT_FOV_COMPOSITION
      ? null
      : (screenshotFovFromValue(fovRaw) ?? SCREENSHOT_FOV_DEFAULT);
  return {
    enabled,
    dolly:
      dollyRaw === null
        ? SCREENSHOT_DOLLY_DEFAULT
        : clampScreenshotDolly(Number(dollyRaw)),
    fov,
    grassLift: grass(
      SCREENSHOT_GRASS_LIFT_PARAM,
      SCREENSHOT_GRASS_LIFT_DEFAULT,
      SCREENSHOT_GRASS_LIFT_MAX,
    ),
    grassVariation: grass(
      SCREENSHOT_GRASS_VARIATION_PARAM,
      SCREENSHOT_GRASS_VARIATION_DEFAULT,
      SCREENSHOT_GRASS_MAX,
    ),
    portrait:
      params.has(SCREENSHOT_PORTRAIT_PARAM) &&
      screenshotFlagFromValue(params.get(SCREENSHOT_PORTRAIT_PARAM)),
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
    if (snapshot.fov !== SCREENSHOT_FOV_DEFAULT)
      url.searchParams.set(
        SCREENSHOT_FOV_PARAM,
        snapshot.fov === null
          ? SCREENSHOT_FOV_COMPOSITION
          : String(snapshot.fov),
      );
    if (snapshot.grassLift !== SCREENSHOT_GRASS_LIFT_DEFAULT)
      url.searchParams.set(
        SCREENSHOT_GRASS_LIFT_PARAM,
        String(snapshot.grassLift),
      );
    if (snapshot.grassVariation !== SCREENSHOT_GRASS_VARIATION_DEFAULT)
      url.searchParams.set(
        SCREENSHOT_GRASS_VARIATION_PARAM,
        String(snapshot.grassVariation),
      );
    if (snapshot.portrait) url.searchParams.set(SCREENSHOT_PORTRAIT_PARAM, "1");
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

  setGrassLift(lift: number) {
    const next = clampScreenshotGrass(
      lift,
      SCREENSHOT_GRASS_LIFT_DEFAULT,
      SCREENSHOT_GRASS_LIFT_MAX,
    );
    if (this.snapshot.grassLift === next) return;
    this.publish({ ...this.snapshot, grassLift: next });
  }

  setGrassVariation(variation: number) {
    const next = clampScreenshotGrass(
      variation,
      SCREENSHOT_GRASS_VARIATION_DEFAULT,
    );
    if (this.snapshot.grassVariation === next) return;
    this.publish({ ...this.snapshot, grassVariation: next });
  }

  setFov(fov: number | null) {
    const next = screenshotFovFromValue(fov);
    if (this.snapshot.fov === next) return;
    this.publish({ ...this.snapshot, fov: next });
  }

  setPortrait(portrait: boolean) {
    if (this.snapshot.portrait === portrait) return;
    this.publish({ ...this.snapshot, portrait });
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
