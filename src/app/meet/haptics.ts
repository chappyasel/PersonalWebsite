/**
 * A light tap of the phone's haptics, for a time picked or a button
 * pressed. Android has the Vibration API. iOS Safari has none, but since
 * iOS 18 flipping an `<input type="checkbox" switch>` plays the system's
 * switch tick, and a click on its label flips it, so a hidden one, flipped
 * and thrown away, gives the same tick. Either works only inside a tap's
 * own handler; anywhere else it does nothing. The switch is never on the
 * screen: a fixed element low on the page brings back Safari's strip under
 * its toolbar (BookingSheet).
 */
export function tick() {
  if (typeof document === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(8);
    return;
  }
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}
