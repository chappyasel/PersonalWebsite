/** The golf ball's radius in scene units. Its own dependency-free module
 * because the boot screen draws the two About balls before the world loads,
 * and golfPhysics reaches three through the course layout: one value import
 * of it from the entrance would put the 98 KB core on the homepage's first
 * paint (initialGraph.test.ts). */
export const GOLF_BALL_RADIUS = 0.05;
