/** Bounded totals for local comparisons through __stacks.state(). */
export const insectLandingMetrics = {
  synchronous: { attempts: 0, planningMs: 0, maxPlanningMs: 0 },
  worker: {
    cancelled: 0,
    invalidContext: 0,
    invalidCollision: 0,
    invalidConnector: 0,
    invalidReservation: 0,
    moth: 0,
    butterfly: 0,
    adopted: 0,
    rejected: 0,
    preparationMs: 0,
    maxPreparationMs: 0,
  },
};
