type ProbeContext = {
  getContextAttributes: () => object | null;
  isContextLost: () => boolean;
};

type ContextHealth = Pick<
  ProbeContext,
  "getContextAttributes" | "isContextLost"
>;

export const WEBGL_CAPABILITY_KEY = "stacks-webgl-v1";

export type WorldEligibility = {
  webglAvailable: boolean;
  prefersReducedMotion: boolean;
  saveData: boolean;
};

/** One policy for both mounting and preloading the immersive homepage. */
export function canUseStacksWorld({
  webglAvailable,
  prefersReducedMotion,
  saveData,
}: WorldEligibility): boolean {
  return webglAvailable && !prefersReducedMotion && !saveData;
}

function probeWebGLSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Browser adapter around the pure eligibility policy above. */
export function browserCanUseStacksWorld(): boolean {
  let webglAvailable: boolean;
  try {
    const cached = window.sessionStorage.getItem(WEBGL_CAPABILITY_KEY);
    if (cached === null) {
      webglAvailable = probeWebGLSupport();
      window.sessionStorage.setItem(
        WEBGL_CAPABILITY_KEY,
        webglAvailable ? "1" : "0",
      );
    } else {
      webglAvailable = cached === "1";
    }
  } catch {
    webglAvailable = probeWebGLSupport();
  }

  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return canUseStacksWorld({
    webglAvailable,
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
    saveData: Boolean(connection?.saveData),
  });
}

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
