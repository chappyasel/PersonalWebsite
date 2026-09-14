import { ROOM_SECTION_PATHNAMES } from "~/lib/site/roomRoutes";

import { TRANSITION_SECTIONS } from "./navigation";

export const DOCUMENT_TRANSITION_KEY = "route-document-transition";

// Runs in the head, before hydration and the incoming document's first paint.
// Keep this function self-contained: its serialized form is the inline script.
function installDocumentTransitions(config: {
  key: string;
  sections: string[];
  rooms: string[];
  subdomains: string[];
}) {
  const root = document.documentElement;
  type Handoff = {
    from: string;
    to: string;
    at: number;
    enabled: boolean;
    clip?: string;
    fallbackClip?: string;
    zoom?: string;
  };
  type TransitionEvent = Event & {
    viewTransition?: ViewTransition;
    activation?: { from: { url: string }; entry: { url: string } };
  };
  let incoming: Handoff | null = null;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  const enabled = () =>
    root.dataset.pageTransitions !== "off" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const path = (url: URL) => {
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const section = config.subdomains.find((value) =>
      url.hostname.startsWith(`${value}.`),
    );
    return section &&
      pathname !== `/${section}` &&
      !pathname.startsWith(`/${section}/`)
      ? `/${section}${pathname === "/" ? "" : pathname}`
      : pathname;
  };
  const eligible = (url: URL) =>
    url.origin === location.origin &&
    !/\.[^/]+$/.test(url.pathname) &&
    !/\/(api|icon|tab-icon)(\/|$)/.test(url.pathname) &&
    (config.rooms.includes(path(url)) ||
      config.sections.includes(path(url).split("/")[1] ?? ""));
  const changesPage = (from: string, to: string) => {
    try {
      const a = new URL(from),
        b = new URL(to);
      return (
        eligible(a) &&
        eligible(b) &&
        path(a) !== path(b) &&
        !(config.rooms.includes(path(a)) && config.rooms.includes(path(b)))
      );
    } catch {
      return false;
    }
  };
  const read = (key: string): Handoff | null => {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(key) ?? "null",
      ) as Handoff | null;
      return value &&
        typeof value.at === "number" &&
        Date.now() - value.at < 30_000 &&
        Date.now() >= value.at &&
        typeof value.enabled === "boolean" &&
        typeof value.from === "string" &&
        typeof value.to === "string"
        ? value
        : null;
    } catch {
      return null;
    }
  };
  const remove = () => {
    try {
      sessionStorage.removeItem(config.key);
    } catch {
      /* Storage can be blocked. */
    }
  };
  const clear = () => {
    clearTimeout(cleanupTimer);
    delete root.dataset.routeDocument;
    root.style.removeProperty("--document-origin-clip");
    root.style.removeProperty("--document-origin-zoom");
    root.style.removeProperty("--document-fallback-clip");
  };
  const apply = (handoff: Handoff | null, mode: "native" | "fallback") => {
    clear();
    if (handoff?.clip && CSS.supports("clip-path", handoff.clip))
      root.style.setProperty("--document-origin-clip", handoff.clip);
    if (
      handoff?.fallbackClip &&
      CSS.supports("clip-path", handoff.fallbackClip)
    )
      root.style.setProperty("--document-fallback-clip", handoff.fallbackClip);
    if (handoff?.zoom && CSS.supports("transform", handoff.zoom))
      root.style.setProperty("--document-origin-zoom", handoff.zoom);
    root.dataset.routeDocument = mode;
  };
  const fallback = (handoff: Handoff | null) => {
    if (!enabled() || handoff?.enabled === false) return;
    apply(handoff, "fallback");
    // CSS starts at first paint. The timer is only a cleanup backstop, never
    // a loading gate; content remains visible even if no animation runs.
    const release = () => {
      cleanupTimer = setTimeout(clear, 1600);
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", release, { once: true });
    else release();
  };
  const candidate = read(config.key);
  if (
    candidate?.to === location.href &&
    changesPage(candidate.from, candidate.to)
  )
    incoming = candidate;
  if (
    !incoming &&
    (
      performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined
    )?.type === "back_forward"
  ) {
    const previous = read(`${config.key}:previous`);
    if (previous && changesPage(previous.from, location.href))
      incoming = { ...previous, to: location.href };
  }
  remove();
  const supportsReveal = "onpagereveal" in window;
  if (!supportsReveal && incoming) fallback(incoming);

  window.addEventListener("pageswap", (raw) => {
    const event = raw as TransitionEvent;
    const from = event.activation?.from?.url;
    const to = event.activation?.entry?.url;
    const stored = read(config.key);
    const handoff =
      stored?.to === to
        ? stored
        : from && to
          ? {
              from,
              to,
              at: Date.now(),
              enabled: enabled(),
            }
          : null;
    // The outgoing entry supplies history direction even in browsers whose
    // Navigation API does not expose activation on the incoming document.
    if (handoff) {
      try {
        sessionStorage.setItem(config.key, JSON.stringify(handoff));
      } catch {
        /* Storage can be blocked. */
      }
    }
    if (!event.viewTransition) return;
    if (
      !enabled() ||
      handoff?.enabled === false ||
      !from ||
      !to ||
      !changesPage(from, to)
    ) {
      event.viewTransition.skipTransition();
      return;
    }
    // History traversals need no launcher. They use the signature's centered
    // source; explicit launches carry their actual bounds through storage.
    apply(handoff?.to === to ? handoff : null, "native");
    void event.viewTransition.finished.catch(() => undefined).then(clear);
  });
  window.addEventListener("pagereveal", (raw) => {
    const event = raw as TransitionEvent;
    // A restored document did not re-run the head script.
    const restored = read(config.key);
    const handoff = restored?.to === location.href ? restored : incoming;
    incoming = null;
    remove();
    const activation = (
      window as Window & {
        navigation?: { activation?: { from?: { url?: string } } };
      }
    ).navigation?.activation;
    const from = handoff?.from ?? activation?.from?.url;
    const eligibleArrival = from && changesPage(from, location.href);
    if (!eligibleArrival || !enabled() || handoff?.enabled === false) {
      event.viewTransition?.skipTransition();
      clear();
      return;
    }
    if (event.viewTransition) {
      apply(handoff, "native");
      void event.viewTransition.finished.catch(() => undefined).then(clear);
    } else fallback(handoff);
  });
  window.addEventListener("pagehide", () => {
    // Also supply a source for Back/Forward in browsers without pagereveal.
    try {
      sessionStorage.setItem(
        `${config.key}:previous`,
        JSON.stringify({
          from: location.href,
          to: location.href,
          at: Date.now(),
          enabled: enabled(),
        }),
      );
    } catch {
      /* Storage can be blocked. */
    }
    if (root.dataset.routeDocument !== "native") clear();
  });
  window.addEventListener("pageshow", (event) => {
    if (supportsReveal || root.dataset.routeDocument === "fallback") return;
    const traversal =
      event.persisted ||
      (
        performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined
      )?.type === "back_forward";
    const previous = read(`${config.key}:previous`);
    if (traversal && previous && changesPage(previous.from, location.href))
      fallback(previous);
  });
  document.addEventListener("animationend", (event) => {
    if (
      event.target === document.body &&
      event.animationName === "route-origin-in" &&
      root.dataset.routeDocument === "fallback"
    )
      clear();
  });
}

export const documentTransitionBootstrapScript = `(${installDocumentTransitions.toString()})(${JSON.stringify(
  {
    key: DOCUMENT_TRANSITION_KEY,
    sections: TRANSITION_SECTIONS,
    subdomains: ["books", "weightlifting", "manual", "routine", "dad"],
    rooms: ["/", "/golf", ...Object.values(ROOM_SECTION_PATHNAMES)],
  },
)});`;
