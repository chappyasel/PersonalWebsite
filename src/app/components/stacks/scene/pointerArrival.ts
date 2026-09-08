// The pointer's first seconds in the room.
//
// The boot screen ends with the bookcase settled on the exact live shelf, and
// the reveal hands the world over at that pose. The camera, though, has been
// listening to the mouse the whole time: the parallax, the truck and the
// orbit all read the pointer as soon as the rig runs, so a mouse resting off
// centre swung the room at full strength the moment the vignette lifted. The
// shelf was placed perfectly and then walked away from it.
//
// This is the envelope that lets the pointer in gradually. It holds at zero
// until two things are true: the boot has handed off (the room is what is on
// screen), and r3f has heard from the pointer at all. It then starts moving
// on the first frame and eases up over two seconds. The rig eases the pointer
// INPUT from its rest by the weight rather than scaling any one output, so
// the handoff pose is exactly the one the boot lined up with, and every reader
// (the parallax, the truck, the orbit, the head turn, the cup pivot, the
// seated sway) rides the same ramp without knowing about it.
//
// Waiting for the pointer to be seen matters as much as waiting for the
// reveal. r3f only writes its pointer on an event, so a mouse that sits still
// through the boot does nothing until its first move, and that move used to
// be the jarring one however long after the reveal it came. Keyed to the
// first move, the ramp starts when the room first learns where the mouse is.

/** How long the pointer takes to earn its full say over the camera. */
export const POINTER_ARRIVAL_SECONDS = 2;

/** A backgrounded tab hands back one enormous delta on return. Capped like
 * the rig's own damping so the ramp cannot finish in one frame. */
export const POINTER_ARRIVAL_MAX_FRAME_SECONDS = 0.05;

export type PointerArrivalInput = Readonly<{
  /** The boot-to-world handoff has finished: the room is what is on screen. */
  revealed: boolean;
  /** r3f has heard from the pointer: its vector is off the (0, 0) it is
   * seeded with. Until then the pointer moves nothing, whatever the weight. */
  pointerSeen: boolean;
  frameSeconds: number;
}>;

/** Step the clock: seconds since the pointer was first heard in the live
 * room, held at zero before the reveal, which also rearms it for an SPA
 * re-entry that boots the room again. */
export function advancePointerArrival(
  elapsed: number,
  input: PointerArrivalInput,
  rampSeconds = POINTER_ARRIVAL_SECONDS,
): number {
  if (!input.revealed) return 0;
  if (!input.pointerSeen) return elapsed;
  const frame = Math.min(
    POINTER_ARRIVAL_MAX_FRAME_SECONDS,
    Math.max(0, Number.isFinite(input.frameSeconds) ? input.frameSeconds : 0),
  );
  return Math.min(rampSeconds, elapsed + frame);
}

/** The pointer's 0→1 say for a clock reading. Ease-in-out makes the first
 * visible frame move gently and lets the camera settle at full gain. */
export function pointerArrivalWeight(
  elapsed: number,
  rampSeconds = POINTER_ARRIVAL_SECONDS,
): number {
  const t = elapsed / Math.max(1e-6, rampSeconds);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped * clamped * (3 - 2 * clamped);
}

/** The pointer the rig reads: `rest` at zero weight, the real pointer at one.
 *
 * The rest is where the pointer moves nothing, and for the run that is the
 * parallax centre, not the screen centre. Desktop stops rest the pointer's
 * neutral in the gap beside the dock, so r3f's seeded (0, 0) already turns
 * the room a degree or two toward the right. The boot stage projects the
 * shelf with no pointer in it at all, so the pose the reveal has to hold is
 * the one at `rest`; from there the real mouse is let in by the weight. */
export function pointerFromRest(
  value: number,
  rest: number,
  weight: number,
): number {
  const finiteRest = Number.isFinite(rest) && Math.abs(rest) < 1 ? rest : 0;
  const finiteValue = Number.isFinite(value) ? value : finiteRest;
  const w = weight < 0 ? 0 : weight > 1 ? 1 : weight;
  return finiteRest + (finiteValue - finiteRest) * w;
}
