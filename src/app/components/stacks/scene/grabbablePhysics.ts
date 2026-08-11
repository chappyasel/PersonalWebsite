/** Most props opt into the lazily loaded shelf solver. Authored compositions
 * can explicitly opt out when every release must reconstruct an exact support
 * graph (the About reading stack is the first such case). */
export function grabbablePhysicsEnabled(preference?: boolean) {
  return preference !== false;
}
