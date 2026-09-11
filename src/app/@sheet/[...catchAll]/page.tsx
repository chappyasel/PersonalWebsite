// Slots keep their previous content across soft navigations, so without
// this a link that navigates AWAY from an open routine/manual sheet (their
// content's own back links) would strand the sheet over the new page. The
// catch-all clears non-root paths; @sheet/page.tsx clears the homepage.
export default function SheetCatchAll() {
  return null;
}
