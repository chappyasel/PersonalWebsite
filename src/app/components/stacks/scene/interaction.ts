"use client";

// "Something above me already answers the pointer for this subtree."
//
// Every GLB prop in the world renders through ModelProp, which makes it the
// one place a universal hover floor can be installed — but a prop wrapped in
// one of the scene's interaction shells (Lift, EggTrigger, Grabbable,
// PropLink) already answers. Two handlers on one subtree is not twice the
// feedback, it is a bug: the inner handler calls stopPropagation, r3f stops
// bubbling there, and the shell above never hears the pointer at all — so the
// prop double-lifts AND loses the cursor its shell was claiming.
//
// A shell wraps its children in InteractionClaim and ModelProp stands down.
// Plain context: nothing to run per frame, and it reads at the call site
// rather than out of the scene graph.
import {
  type ReactNode,
  createContext,
  createElement,
  useContext,
} from "react";

const ClaimContext = createContext(false);

/** Mark this subtree as already having pointer interaction of its own. */
export function InteractionClaim({ children }: { children: ReactNode }) {
  return createElement(ClaimContext.Provider, { value: true }, children);
}

/** True when an ancestor claimed the pointer — do not add another handler. */
export function useInteractionClaimed(): boolean {
  return useContext(ClaimContext);
}
