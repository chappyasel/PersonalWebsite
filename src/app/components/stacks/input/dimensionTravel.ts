/** Transient travel pose shared only during an explicit dimension handoff. */
export const dimensionTravel = {
  position: null as number | null,
  revision: 0,
  readIllustratedPosition: null as (() => number) | null,
};
