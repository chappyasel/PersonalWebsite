/**
 * Whether the grid's head (the nav, the Day headings, the panel's rounded
 * top, and the zones) sticks at the window's top as the hours scroll, as
 * frosted glass they show through blurred (.stickyHead). The computer's
 * card sticks level with the stuck grid.
 *
 * On an iPhone, Safari 26 and later paint a solid strip under the status
 * bar, in place of its blur, once the head touches the window's top, and
 * keep it until Safari is quit. A strip pinned there from the first frame
 * (.statusFade) makes it solid from the start, so it doesn't change
 * mid-scroll. The Owner chose that over a head stuck short of the edge,
 * which kept the blur but left the hours showing through above the head
 * (November 4, 2026).
 */
export const STICKY_HEADER = true;
