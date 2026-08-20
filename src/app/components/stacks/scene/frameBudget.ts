// The absolute frame budget, and nothing else.
//
// WHY THIS IS ITS OWN MODULE. The budget is needed by the quality policy, by
// the manual trace report, and by the frame sampler. Two of those are reached
// from the homepage's static import graph, so importing the constant from
// `quality.ts` dragged the entire five-profile policy table into the homepage
// bundle for the sake of one number. A leaf module with no imports of its own
// cannot do that to anyone.
//
// WHY THE BUDGET IS ABSOLUTE. It used to be the device's own 10th-percentile
// frame time. A device holding a steady 40 Hz produced a 24 ms budget, which
// put its 95th percentile at roughly 1.1 times "target" and its dropped-frame
// ratio near zero, so the controller read a visibly slow device as healthy and
// then upgraded it. A target a device defines for itself cannot be missed.

export const SCENE_FRAME_BUDGET_MS = 1_000 / 60;
export const SCENE_FRAME_BUDGET_HZ = 60;

/** A frame counts as dropped past this multiple of the budget. Shared so the
 * controller and the trace report never disagree about the same frames. */
export const SCENE_DROPPED_FRAME_MULTIPLIER = 1.5;
