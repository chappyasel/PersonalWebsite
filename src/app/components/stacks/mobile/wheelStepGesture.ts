/** Match the axis used to move the room for wheel and trackpad input. */
export function worldWheelDelta(event: Pick<WheelEvent, "deltaX" | "deltaY">) {
  return Math.abs(event.deltaY) >= Math.abs(event.deltaX)
    ? event.deltaY
    : event.deltaX;
}

/** Keep native horizontal travel through diagonal momentum tails. */
export function nativeHorizontalWheelGesture() {
  let lastAt = -Infinity;
  let horizontal = false;
  return (event: WheelEvent, scrollElement: HTMLElement) => {
    const now = performance.now();
    if (now - lastAt > 180) {
      horizontal =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
    }
    lastAt = now;
    return (
      horizontal &&
      !event.ctrlKey &&
      event.target instanceof Node &&
      scrollElement.contains(event.target)
    );
  };
}

/** One step per gesture, including its momentum tail. Eligibility belongs
 * to the start, so arriving at About cannot also open Search. */
export function wheelStepGesture(
  step: (direction: -1 | 1) => void,
  axis: "horizontal" | "world" = "horizontal",
) {
  let lastAt = -Infinity;
  let distance = 0;
  let eligible = false;
  let direction = 0;
  let lastMagnitude = 0;
  let fading = false;
  let risingPulls = 0;
  let risingDistance = 0;
  return (event: WheelEvent, canStart: boolean) => {
    if (!event.ctrlKey && event.deltaX === 0 && event.deltaY === 0)
      return false;
    const at = performance.now();
    const delta = axis === "world" ? worldWheelDelta(event) : event.deltaX;
    const accepted =
      !event.ctrlKey &&
      (axis === "world" || Math.abs(event.deltaX) > Math.abs(event.deltaY));
    const magnitude =
      Math.abs(delta) *
      (event.deltaMode === 1
        ? 33
        : event.deltaMode === 2
          ? axis === "world"
            ? window.innerHeight
            : window.innerWidth
          : 1);
    const separated = at - lastAt > 180;
    const sameDirection = Math.sign(delta) === direction;
    if (!separated && accepted && sameDirection) {
      if (!eligible && magnitude < lastMagnitude) fading = true;
      if (fading && canStart && magnitude > lastMagnitude) {
        risingPulls += 1;
        risingDistance += magnitude;
      } else {
        risingPulls = 0;
        risingDistance = 0;
      }
    } else {
      fading = false;
      risingPulls = 0;
      risingDistance = 0;
    }
    // Match renewed edge pulls: three growing packets distinguish another
    // swipe from a single larger packet in the old momentum tail.
    const renewed = !eligible && risingPulls >= 3 && risingDistance >= 48;
    if (separated || renewed) {
      distance = renewed ? risingDistance - magnitude : 0;
      direction = Math.sign(delta);
      eligible = canStart && accepted;
      fading = false;
      risingPulls = 0;
      risingDistance = 0;
    }
    lastAt = at;
    lastMagnitude = magnitude;
    if (!canStart || !accepted || Math.sign(delta) !== direction)
      eligible = false;
    if (!eligible) return false;
    distance += magnitude;
    if (distance < 72) return false;
    eligible = false;
    fading = false;
    step(direction < 0 ? -1 : 1);
    return true;
  };
}
