import type { SpringOptions } from "framer-motion";

// Shared by shelf cards and the cover in book details.
export const bookHoverSpring: SpringOptions = {
  damping: 25,
  stiffness: 120,
  mass: 1,
};

export const bookHoverScale = {
  XS: 1.2,
  S: 1.15,
  M: 1.1,
  L: 1.05,
} as const;

export const bookTiltAmplitude = {
  XS: 0,
  S: 20,
  M: 15,
  L: 10,
} as const;
