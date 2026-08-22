type ProbeContext = {
  getContextAttributes: () => object | null;
  isContextLost: () => boolean;
};

type ContextHealth = Pick<
  ProbeContext,
  "getContextAttributes" | "isContextLost"
>;

/** Postprocessing assumes context attributes are always present. Browsers
 * return null instead once a context has been lost. */
export function isWebGLContextUsable(context: ContextHealth | null): boolean {
  if (!context) return false;
  try {
    return !context.isContextLost() && context.getContextAttributes() !== null;
  } catch {
    return false;
  }
}
