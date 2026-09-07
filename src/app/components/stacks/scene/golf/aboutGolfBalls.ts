/** Golf balls that begin on the ground in front of About. Their stable keys
 * prove their origin when the Training bay receives one; no carry history is
 * stored just to award the corresponding Field Note. */
export const ABOUT_GOLF_BALLS = [
  {
    id: "about-a",
    base: [-1.1692, -1.115, 0.1248] as const,
    yaw: 0.3769,
  },
  {
    id: "about-b",
    base: [-0.9889, -1.134, 0.3023] as const,
    yaw: 2.2,
  },
] as const;

const ABOUT_GOLF_BALL_KEYS = new Set(
  ABOUT_GOLF_BALLS.map((ball) => `golf-ball:${ball.id}`),
);

export function isAboutGolfBallKey(key: string) {
  return ABOUT_GOLF_BALL_KEYS.has(key);
}
