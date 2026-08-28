// Slots keep their previous content across soft navigations, so without
// this a link that navigates AWAY (the back crumb, any dashboard link)
// would strand the open sheet over the new page. The optional catch-all
// claims every path the interceptors don't, rendering nothing — the
// documented dismissal pattern for intercepted modals.
export default function SheetCatchAll() {
  return null;
}
