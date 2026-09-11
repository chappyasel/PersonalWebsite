declare global {
  interface Window {
    __booksRouteHistory?: { pop: ((event: PopStateEvent) => void) | null };
  }
}

// Trusted window popstate listeners run in registration order in Chromium,
// including capture listeners. Register before Next hydrates; the late-loaded
// animation controller supplies the handler. Disabled/unloaded is a no-op.
export const booksHistoryBootstrapScript = `(()=>{
  if(window.__booksRouteHistory)return;
  const bridge=window.__booksRouteHistory={pop:null};
  window.addEventListener("popstate",event=>bridge.pop?.(event),true);
})();`;
