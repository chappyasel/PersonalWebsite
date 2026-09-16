export const OVERLAY_OPEN_ATTRIBUTE = "data-overlay-open";

export type OverlayKind =
  | "command"
  | "document"
  | "image"
  | "scene-image"
  | "video"
  | "album"
  | "object"
  | "drawer";
export type OverlayPhase = "open" | "closing";
type Entry = {
  kind: OverlayKind;
  phase: OverlayPhase;
  settled: boolean;
  surface?: HTMLElement;
  backdrop?: HTMLElement;
  dismiss: () => void;
};

const entries: Entry[] = [];
const listeners = new Set<() => void>();
type OverlaySnapshot = Readonly<{
  depth: number;
  top: OverlayKind | null;
  hasOpenOverlay: boolean;
  blockPointer: boolean;
  blockRoom: boolean;
  freezeRoom: boolean;
  pauseBackground: boolean;
}>;
const empty: OverlaySnapshot = Object.freeze({
  depth: 0,
  top: null as OverlayKind | null,
  hasOpenOverlay: false,
  blockPointer: false,
  blockRoom: false,
  freezeRoom: false,
  pauseBackground: false,
});
let snapshot = empty;
let pauseHeld = false;
let previousOverflow = "";
let ownsScroll = false;
const originalInteraction = new WeakMap<
  HTMLElement,
  { inert: boolean; hidden: string | null }
>();

function focusRoot(surface: HTMLElement) {
  return surface.matches('[role="dialog"]')
    ? surface
    : (surface.querySelector<HTMLElement>('[role="dialog"]') ?? surface);
}

const focusableSelector =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

/** Custom document and photo engines use the same focus rules as DOM dialogs. */
function containOverlayFocus(surface: HTMLElement) {
  const root = focusRoot(surface);
  const focus = (event: FocusEvent) => {
    if (!ownsOverlayInput(surface)) return;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-radix-popper-content-wrapper]")
    )
      return;
    if (event.target instanceof Node && surface.contains(event.target)) return;
    root.focus({ preventScroll: true });
  };
  const key = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.key !== "Tab" ||
      !ownsOverlayInput(surface)
    )
      return;
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter(
      (node) =>
        !node.closest('[hidden], [inert], [aria-hidden="true"]') &&
        getComputedStyle(node).display !== "none" &&
        getComputedStyle(node).visibility !== "hidden",
    );
    const first = targets[0];
    const last = targets.at(-1);
    if (!first || !last) {
      event.preventDefault();
      root.focus({ preventScroll: true });
    } else if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === root)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("focusin", focus);
  window.addEventListener("keydown", key);
  return () => {
    document.removeEventListener("focusin", focus);
    window.removeEventListener("keydown", key);
  };
}

export const overlayCoordinator = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => empty,
};

/** A parent overlay yields its shortcuts and focus trap to its child. */
export function ownsOverlayInput(element: Element | null) {
  const top = entries.at(-1);
  return (
    !top ||
    (!!element &&
      !!top.surface &&
      (element === top.surface || top.surface.contains(element)))
  );
}

export function roomOverlayBlocksInput() {
  return snapshot.blockRoom;
}

/** Origin flights measure immediately, before React commits the closing state. */
export function beginOverlayClose(element: Element | null) {
  const entry = [...entries]
    .reverse()
    .find((candidate) => !!element && candidate.surface?.contains(element));
  if (!entry || entry.phase === "closing") return;
  entry.phase = "closing";
  publish();
}

function publish() {
  const top = entries.at(-1);
  pauseHeld =
    entries.some((entry) => entry.phase === "open") &&
    (pauseHeld ||
      entries.some((entry) => entry.settled && entry.phase === "open"));
  snapshot = Object.freeze({
    depth: entries.length,
    top: top?.kind ?? null,
    hasOpenOverlay: entries.some((entry) => entry.phase === "open"),
    blockRoom: entries.length > 0,
    // Physical inspection still uses the pointer to turn the selected object.
    blockPointer: entries.some((entry) => entry.kind !== "object"),
    pauseBackground: pauseHeld,
    // Dismissal resumes ambient motion unless another overlay remains open.
    // Input remains blocked until the retained closing presentation releases.
    freezeRoom: pauseHeld && top?.kind !== "object" && top?.phase !== "closing",
  });
  const root = document.documentElement;
  root.toggleAttribute("data-overlay-input", snapshot.blockRoom);
  root.toggleAttribute("data-overlay-dom-input", snapshot.blockPointer);
  root.toggleAttribute(
    OVERLAY_OPEN_ATTRIBUTE,
    entries.some(
      (entry) =>
        ["document", "video", "drawer"].includes(entry.kind) &&
        entry.phase === "open",
    ),
  );
  root.toggleAttribute(
    "data-overlay-chrome",
    entries.some(
      (entry) =>
        entry.phase === "open" &&
        !(
          entry.kind === "scene-image" &&
          root.getAttribute("data-room-view") === "illustrated"
        ),
    ),
  );
  root.style.setProperty(
    "--overlay-floating-layer",
    String(5100 + entries.length * 100),
  );
  entries.forEach((entry, index) => {
    if (entry.surface) {
      entry.surface.style.zIndex = String(5001 + index * 100);
      const covered =
        entry !== top && !entry.surface.contains(top?.surface ?? null);
      const original = originalInteraction.get(entry.surface)!;
      entry.surface.inert = covered || original.inert;
      if (covered) entry.surface.setAttribute("aria-hidden", "true");
      else if (original.hidden === null)
        entry.surface.removeAttribute("aria-hidden");
      else entry.surface.setAttribute("aria-hidden", original.hidden);
    }
    if (entry.backdrop)
      entry.backdrop.style.zIndex = String(5000 + index * 100);
  });
  const lockScroll = entries.some((entry) => entry.kind !== "object");
  if (lockScroll && !ownsScroll) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  } else if (!lockScroll && ownsScroll) {
    document.body.style.overflow = previousOverflow;
    const original = previousOverflow;
    // Some viewer engines restore overflow in passive unmount cleanup.
    queueMicrotask(() => {
      if (!ownsScroll) document.body.style.overflow = original;
    });
  }
  ownsScroll = lockScroll;
  for (const listener of listeners) listener();
}

function onKeyDown(event: KeyboardEvent) {
  const top = entries.at(-1);
  if (!top || event.key !== "Escape" || event.isComposing) return;
  // A select/popover opened within the overlay gets the first Escape.
  if (
    event.target instanceof Element &&
    event.target.closest(
      '[data-radix-popper-content-wrapper], [role="listbox"], [role="menu"]',
    )
  )
    return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (top.phase !== "closing") {
    top.phase = "closing";
    publish();
    top.dismiss();
  }
}

/** One lease per mounted presentation, released after its exit animation. */
export function registerOverlay(
  options: Omit<Entry, "phase" | "settled"> & {
    phase?: OverlayPhase;
    settled?: boolean;
  },
) {
  const entry: Entry = {
    ...options,
    phase: options.phase ?? "open",
    settled: options.settled ?? true,
  };
  const surfaceZ = entry.surface?.style.zIndex ?? "";
  const backdropZ = entry.backdrop?.style.zIndex ?? "";
  const image = entry.kind === "image" || entry.kind === "scene-image";
  const returnFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (image && entry.surface) {
    entry.surface.tabIndex = -1;
    entry.surface.setAttribute("aria-modal", "true");
    if (!entry.surface.hasAttribute("aria-label"))
      entry.surface.setAttribute("aria-label", "Image viewer");
  }
  if (entry.surface)
    originalInteraction.set(entry.surface, {
      inert: entry.surface.inert,
      hidden: entry.surface.getAttribute("aria-hidden"),
    });
  entries.push(entry);
  if (entries.length === 1) window.addEventListener("keydown", onKeyDown, true);
  publish();
  const customFocus =
    entry.surface && ["document", "image", "scene-image"].includes(entry.kind);
  const releaseFocus = customFocus
    ? containOverlayFocus(entry.surface!)
    : undefined;
  if (image)
    queueMicrotask(() => {
      if (entry === entries.at(-1))
        entry.surface
          ?.querySelector<HTMLElement>("button")
          ?.focus({ preventScroll: true });
    });
  let released = false;
  return {
    settle() {
      if (released || entry.settled || entry.phase === "closing") return;
      entry.settled = true;
      publish();
    },
    update(phase: OverlayPhase) {
      if (released || phase === entry.phase) return;
      entry.phase = phase;
      publish();
    },
    release() {
      if (released) return;
      released = true;
      releaseFocus?.();
      entries.splice(entries.indexOf(entry), 1);
      if (entry.surface) entry.surface.style.zIndex = surfaceZ;
      if (entry.surface) {
        const original = originalInteraction.get(entry.surface)!;
        entry.surface.inert = original.inert;
        if (original.hidden === null)
          entry.surface.removeAttribute("aria-hidden");
        else entry.surface.setAttribute("aria-hidden", original.hidden);
        originalInteraction.delete(entry.surface);
      }
      if (entry.backdrop) entry.backdrop.style.zIndex = backdropZ;
      if (!entries.length)
        window.removeEventListener("keydown", onKeyDown, true);
      publish();
      if (customFocus)
        queueMicrotask(() => {
          const top = entries.at(-1);
          if (
            returnFocus?.isConnected &&
            (!top || top.surface?.contains(returnFocus))
          )
            returnFocus.focus({ preventScroll: true });
        });
    },
  };
}
