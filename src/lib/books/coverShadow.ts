/** A fixed overhead light: raised covers cast broader shadows farther below,
 * and the lifted edge shifts the shadow slightly toward that edge. */
export function bookCoverShadow(rotateX = 0, rotateY = 0, scale = 1, size = 1) {
  const lift = Math.max(0, Math.min(1, (scale - 1) / 0.1));
  const extent = Math.max(0, size);
  const x = -Math.max(-20, Math.min(20, rotateY)) * 0.35 * extent;
  const y =
    (5 + lift * 10 + Math.max(-20, Math.min(20, rotateX)) * 0.25) * extent;
  const blur = (20 + lift * 16) * extent;
  const spread = (2 - lift * 2) * extent;
  return `${x.toFixed(2)}px ${y.toFixed(2)}px ${blur.toFixed(2)}px ${spread.toFixed(2)}px rgba(0, 0, 0, 0.12)`;
}

export const restingBookCoverShadow = bookCoverShadow();
