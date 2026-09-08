// The sheet slot is empty everywhere except a client-side navigation to
// /routine, /manual, or /systems, which the (.)-interceptors present over
// the current page instead of tearing it down. On a phone-sized viewport the
// launchers make a full-page load instead (src/components/modal-sheet/
// sheetRoute.ts), so the slot never fills there.
export default function SheetDefault() {
  return null;
}
