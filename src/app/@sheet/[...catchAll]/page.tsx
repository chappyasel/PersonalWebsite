// Slots keep their previous content across soft navigations, so without
// this a link that navigates AWAY from an open routine/manual sheet (their
// content's own back links) would strand the sheet over the new page. The
// optional catch-all claims every path the interceptors don't, rendering
// nothing — the documented dismissal pattern for intercepted modals.
export default function SheetCatchAll() {
  return null;
}
