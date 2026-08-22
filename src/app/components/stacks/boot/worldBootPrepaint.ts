// The pre-paint adapter: the same boot decision, written as a script that can
// run while the document is still parsing.
//
// This exists because the flat document cannot be painted and then taken away.
// The capability decision has to be made and the handshake attribute has to be
// on <html> before the first paint, which is long before React exists — so
// this one adapter cannot import the machine, and has to make the call inline.
//
// It is GENERATED from WORLD_BOOT_POLICY rather than typed as a template so no
// timeout, storage key, or attribute name can drift from the hydrated path.
// The decision logic is still written out by hand here, which is the one place
// where drift is possible; worldBootPrepaint.test.ts closes that by executing
// this script against a fake document and asserting it lands on the same phase
// the machine does, over the whole input matrix.
import { WORLD_BOOT_POLICY, type WorldBootPolicy } from "./worldBootPolicy";

/** The inline script body for the homepage's pre-paint boot handshake.
 *
 * Everything is wrapped in try/catch: a browser that refuses storage, blocks
 * canvas, or has no `matchMedia` must land on the plain document rather than
 * an unstyled page. */
export function worldBootPrepaintScript(
  policy: WorldBootPolicy = WORLD_BOOT_POLICY,
): string {
  const q = (value: string | number) => JSON.stringify(value);
  const timer = `window[${q(policy.prepaintTimerGlobal)}]`;
  const token = `window[${q(policy.prepaintTokenGlobal)}]`;
  const startedAt = `window[${q(policy.prepaintStartedAtGlobal)}]`;
  const outcome = `window[${q(policy.prepaintOutcomeGlobal)}]`;
  return `
try {
  var el = document.documentElement;
  // The automated OG renderer asks for the same live scene with its DOM
  // controls removed. Set this during parsing so not even the first paint can
  // leak homepage chrome into the capture.
  if (new URLSearchParams(location.search).has(${q(policy.ogCaptureParam)})) {
    el.setAttribute(${q(policy.ogCaptureAttribute)}, "");
  }
  if (${timer}) {
    clearTimeout(${timer});
    ${timer} = 0;
  }
  var bootToken = (${token} || 0) + 1;
  ${token} = bootToken;
  ${startedAt} = performance.now();

  // Cache only the stable capability probe. Motion preference and Save-Data
  // are live visitor choices and must be evaluated on every document load.
  // Storage access gets its own guard. A browser that refuses it entirely
  // must still reach the same answer hydration will: probe the canvas, skip
  // the cache, run the world. Letting this throw to the outer catch used to
  // hand those visitors the document pre-paint and the world a second later.
  var ok = null;
  try {
    ok = sessionStorage.getItem(${q(policy.webglCapabilityKey)});
  } catch (_) {}
  if (ok === null) {
    ok = "0";
    var c = document.createElement("canvas");
    if (c.getContext("webgl2") || c.getContext("webgl")) ok = "1";
    try {
      sessionStorage.setItem(${q(policy.webglCapabilityKey)}, ok);
    } catch (_) {}
  }
  var motionOK = !matchMedia(${q(policy.reducedMotionQuery)}).matches;
  var dataOK = !(navigator.connection && navigator.connection.saveData);
  if (ok === "1" && motionOK && dataOK) {
    var warm = false;
    try {
      var rec = JSON.parse(localStorage.getItem(${q(policy.warmKey)}) || "null");
      var age = rec ? Date.now() - rec.t : Infinity;
      if (age >= 0 && age < ${q(policy.warmTtlMs)}) warm = true;
    } catch (_) {}
    el.setAttribute(${q(policy.worldAttribute)}, warm ? "warm" : "pending");
    // Fail open. If the bundle never boots, the flat page is hidden behind a
    // loading screen nothing else will ever retire.
    ${timer} = setTimeout(function () {
      if (${token} !== bootToken) return;
      ${timer} = 0;
      var w = el.getAttribute(${q(policy.worldAttribute)});
      if (w === "pending" || w === "warm") {
        el.removeAttribute(${q(policy.worldAttribute)});
        // Tell hydration this load already failed open, so it continues the
        // flat page instead of starting a second, longer wait over it.
        ${outcome} = { token: bootToken, timedOut: true };
      }
    }, ${q(policy.prepaintBackstopMs)});
  } else {
    el.removeAttribute(${q(policy.worldAttribute)});
  }
} catch (_) {}
`;
}
