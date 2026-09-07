// The sheet slot is empty everywhere except a client-side navigation to
// /routine, /manual, or /systems, which the (.)-interceptors present over
// the current page instead of tearing it down.
export default function SheetDefault() {
  return null;
}
