/**
 * Whether the grid's head (the nav, the Day headings, the panel's rounded
 * top, and the zones) sticks at the window's top as the hours scroll. Off
 * for now, as the Owner asked on November 4, 2026: on an iPhone the page
 * scrolls under the keyboard and the strip behind the status bar didn't
 * fade with the page behind the open card. Turned on, WeekStrip sticks the
 * head, the page lays its ground under the status bar with a short fade
 * (.statusFade), and the computer's card sticks level with the stuck grid.
 */
export const STICKY_HEADER = false;
