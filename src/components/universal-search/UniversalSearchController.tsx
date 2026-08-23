"use client";

import {
  type ComponentType,
  type ForwardedRef,
  type RefAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
  universalSearchFocusIntent,
} from "~/lib/universal-search/overlay";

export const OPEN_UNIVERSAL_SEARCH_EVENT = "chappy:universal-search:open";

export type UniversalSearchPaletteHandle = {
  focusInput: () => void;
};

export type UniversalSearchPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type UniversalSearchPaletteComponent = ComponentType<
  UniversalSearchPaletteProps & RefAttributes<UniversalSearchPaletteHandle>
>;

export type UniversalSearchPaletteModule = {
  UniversalSearchPalette: UniversalSearchPaletteComponent;
};

type PaletteLoader = () => Promise<UniversalSearchPaletteModule>;
type PreloadScheduler = (preload: () => void) => () => void;

let defaultPalettePromise: Promise<UniversalSearchPaletteModule> | null = null;

function loadDefaultPalette() {
  defaultPalettePromise ??= import("./UniversalSearchPalette").catch(
    (error: unknown) => {
      defaultPalettePromise = null;
      throw error;
    },
  );
  return defaultPalettePromise;
}

type IdleHost = {
  readyState: DocumentReadyState;
  addLoadListener: (listener: () => void) => void;
  removeLoadListener: (listener: () => void) => void;
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (id: number) => void;
};

function browserIdleHost(): IdleHost {
  return {
    readyState: document.readyState,
    addLoadListener: (listener) =>
      window.addEventListener("load", listener, { once: true }),
    removeLoadListener: (listener) =>
      window.removeEventListener("load", listener),
    requestIdleCallback:
      "requestIdleCallback" in window
        ? window.requestIdleCallback.bind(window)
        : undefined,
    cancelIdleCallback:
      "cancelIdleCallback" in window
        ? window.cancelIdleCallback.bind(window)
        : undefined,
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (id) => window.clearTimeout(id),
  };
}

export function scheduleIdlePalettePreload(
  preload: () => void,
  host = browserIdleHost(),
) {
  let idleId: number | undefined;
  let timeoutId: number | undefined;

  const schedule = () => {
    if (host.requestIdleCallback) {
      idleId = host.requestIdleCallback(() => preload(), { timeout: 3_000 });
    } else {
      timeoutId = host.setTimeout(preload, 2_000);
    }
  };

  if (host.readyState === "complete") schedule();
  else host.addLoadListener(schedule);

  return () => {
    host.removeLoadListener(schedule);
    if (idleId !== undefined) host.cancelIdleCallback?.(idleId);
    if (timeoutId !== undefined) host.clearTimeout(timeoutId);
  };
}

export function isUniversalSearchShortcut(event: KeyboardEvent) {
  return (
    event.key.toLowerCase() === "k" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey
  );
}

export function openUniversalSearch() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_UNIVERSAL_SEARCH_EVENT));
}

export function UniversalSearchController({
  enabled = true,
  loadPalette = loadDefaultPalette,
  schedulePreload = scheduleIdlePalettePreload,
}: {
  enabled?: boolean;
  loadPalette?: PaletteLoader;
  schedulePreload?: PreloadScheduler;
}) {
  const [open, setOpen] = useState(false);
  const [Palette, setPalette] =
    useState<UniversalSearchPaletteComponent | null>(null);
  const palettePromiseRef =
    useRef<Promise<UniversalSearchPaletteModule> | null>(null);
  const paletteRef = useRef<UniversalSearchPaletteHandle>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const ensurePalette = useCallback(() => {
    palettePromiseRef.current ??= loadPalette();
    const pending = palettePromiseRef.current;
    void pending.then(
      (module) => {
        if (palettePromiseRef.current !== pending) return;
        setPalette(() => module.UniversalSearchPalette);
      },
      (error: unknown) => {
        if (palettePromiseRef.current !== pending) return;
        palettePromiseRef.current = null;
        setOpen(false);
        document.documentElement.removeAttribute(
          UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
        );
        restoreFocusRef.current?.focus();
        restoreFocusRef.current = null;
        console.error("Universal Search palette failed to load", error);
      },
    );
    return pending;
  }, [loadPalette]);

  const closePalette = useCallback(() => {
    setOpen(false);
    document.documentElement.removeAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
    restoreFocusRef.current?.focus();
    restoreFocusRef.current = null;
  }, []);

  const showPalette = useCallback(() => {
    if (document.pointerLockElement !== null) document.exitPointerLock?.();
    restoreFocusRef.current ??=
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.documentElement.setAttribute(
      UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
      "true",
    );
    setOpen(true);
    void ensurePalette();
  }, [ensurePalette]);

  useEffect(() => {
    if (!enabled) return;
    return schedulePreload(() => void ensurePalette());
  }, [enabled, ensurePalette, schedulePreload]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isUniversalSearchShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (open) closePalette();
        else showPalette();
        return;
      }
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePalette();
      }
    };
    const onOpen = () => showPalette();
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(OPEN_UNIVERSAL_SEARCH_EVENT, onOpen);
    };
  }, [closePalette, enabled, open, showPalette]);

  useEffect(() => {
    if (!enabled || !open || !Palette) return;
    let reclaimFrame: number | null = null;
    const focusInput = () => paletteRef.current?.focusInput();
    const reclaimFocus = () => {
      reclaimFrame = null;
      if (
        !document.documentElement.hasAttribute(
          UNIVERSAL_SEARCH_OPEN_ATTRIBUTE,
        ) ||
        universalSearchFocusIntent(document.activeElement) === "keep"
      )
        return;
      focusInput();
    };
    const scheduleReclaim = () => {
      if (reclaimFrame !== null) cancelAnimationFrame(reclaimFrame);
      reclaimFrame = requestAnimationFrame(reclaimFocus);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (universalSearchFocusIntent(event.target) === "keep") return;
      // Two ways focus leaves the search input while the palette is up, and
      // both end with keystrokes landing somewhere that cannot accept text:
      // scene controls that focus themselves once their animation or travel
      // settles, and clicks on the palette's own `tabindex="-1"` chrome. While
      // search is open, the input owns keyboard focus.
      focusInput();
    };
    const onVisibilityChange = () => {
      if (!document.hidden) scheduleReclaim();
    };

    focusInput();
    scheduleReclaim();
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("focusout", scheduleReclaim, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", scheduleReclaim);
    return () => {
      if (reclaimFrame !== null) cancelAnimationFrame(reclaimFrame);
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("focusout", scheduleReclaim, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", scheduleReclaim);
    };
  }, [enabled, open, Palette]);

  useEffect(
    () => () => {
      document.documentElement.removeAttribute(UNIVERSAL_SEARCH_OPEN_ATTRIBUTE);
    },
    [],
  );

  if (!enabled || !Palette) return null;
  return (
    <Palette
      ref={paletteRef as ForwardedRef<UniversalSearchPaletteHandle>}
      open={open}
      onOpenChange={(next) => (next ? showPalette() : closePalette())}
    />
  );
}
