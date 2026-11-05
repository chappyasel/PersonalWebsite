/** /meet's blue brighter than white, on an HDR screen, for the Book button
 * while it's pressed: `--mt-accent` in light mode, its strongest channel at
 * 1.5x SDR white (203 nits), as the Owner asked on November 4, 2026. `pnpm generate:hdr-accent` makes
 * public/hdr/meet-accent.mp4 from it, so rerun that when the accent
 * changes. Dark mode's blue is a step lighter and close enough to share
 * the plate. */
export const MEET_HDR = {
  accent: [0, 122, 255],
  nits: 305,
  src: "/hdr/meet-accent.mp4",
} as const;
