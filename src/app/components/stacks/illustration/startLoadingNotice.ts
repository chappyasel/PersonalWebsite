/** Shared by the parsing-time script and hydration, so the notice waits once.
 * Client-only room entries start the same clock when their status mounts. */
export function startLoadingNotice() {
  const root = document.documentElement;
  if (root.hasAttribute("data-room-loading-started")) return;
  root.setAttribute("data-room-loading-started", "");
  setTimeout(() => root.setAttribute("data-room-loading-visible", ""), 1000);
}
