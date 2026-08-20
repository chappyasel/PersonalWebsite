/**
 * An opaque stand-in for the scene, painted directly behind the canvas.
 *
 * WHY THIS EXISTS. The canvas is composited as a transparent layer — three
 * hardcodes `alpha: true` into the context attributes, so the renderer's own
 * `alpha` parameter cannot change that; it only picks the clear alpha. The
 * first opaque ancestor above the canvas is the page itself at
 * rgb(250 250 249). Every composited frame is therefore the scene blended
 * over near-white paper, and any frame the compositor cannot fully update the
 * canvas layer for shows that paper straight through.
 *
 * That is what a reported "white flash" on a shelf transition is made of. The
 * colour comes from the page, not from the renderer, which is why it reads as
 * white rather than black, and why it is invisible to every renderer-side
 * probe: draw calls never collapse, and reading the drawing buffer after the
 * composer's screen pass found no white frame in 2303 samples over 40s. The
 * pixels were right. The compositing of them was not.
 *
 * The trigger sits below anything this code can reach — a layer whose backing
 * store is being reallocated, most plausibly by the resolution axis resizing
 * the drawing buffer, which a shelf transition does at least twice. So rather
 * than chase the trigger, remove the consequence: put something scene-shaped
 * behind the canvas, and a dropped frame costs a momentary softness instead
 * of a white page.
 *
 * WHY A GRADIENT AND NOT A FLAT COLOUR. The frame is sky at the top and
 * meadow at the bottom; a single tone would still flash, just less. These
 * stops are measured, not chosen: readPixels across full-width rows at eleven
 * heights of the rendered frame, averaged per row, one pass per theme. They
 * are sampled at the About stop, so the warm band near the middle is the room
 * and its lamp. Travelling shifts that band a little, which does not matter
 * for something only ever seen for a frame at a time.
 *
 * This is deliberately NOT an attempt to look like the scene when the scene
 * is missing for longer than a frame. A held blank canvas should still look
 * broken — the boot screen and the flat fallback own that case.
 */
export const SCENE_BACKDROP = {
  light:
    "linear-gradient(to bottom," +
    " rgb(24 122 198) 0%," +
    " rgb(0 129 206) 10%," +
    " rgb(78 154 205) 20%," +
    " rgb(115 162 183) 30%," +
    " rgb(165 156 140) 40%," +
    " rgb(145 170 151) 50%," +
    " rgb(111 162 93) 60%," +
    " rgb(78 128 67) 70%," +
    " rgb(46 84 41) 80%," +
    " rgb(42 74 35) 90%," +
    " rgb(60 83 59) 100%)",
  dark:
    "linear-gradient(to bottom," +
    " rgb(17 29 58) 0%," +
    " rgb(33 49 87) 10%," +
    " rgb(37 54 93) 20%," +
    " rgb(39 46 63) 30%," +
    " rgb(150 118 88) 40%," +
    " rgb(86 78 69) 50%," +
    " rgb(51 79 63) 60%," +
    " rgb(36 63 51) 70%," +
    " rgb(26 46 39) 80%," +
    " rgb(21 37 32) 90%," +
    " rgb(21 31 37) 100%)",
} as const;

export function sceneBackdropFor(dark: boolean) {
  return dark ? SCENE_BACKDROP.dark : SCENE_BACKDROP.light;
}
