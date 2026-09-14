"use client";

import { useSyncExternalStore } from "react";

export const DESKTOP_MOTION_STORAGE_KEY = "stacks-reduced-motion";
const DESKTOP_QUERY =
  "(min-width: 1200px) and (hover: hover) and (pointer: fine)";
const listeners = new Set<() => void>();
let requested = false;
let reduced = false;
let disconnect: (() => void) | null = null;

function connect() {
  const desktop = window.matchMedia(DESKTOP_QUERY);
  const update = () => {
    reduced = requested && desktop.matches;
    document.documentElement.toggleAttribute(
      "data-desktop-reduced-motion",
      reduced,
    );
    for (const listener of listeners) listener();
  };
  const read = () => {
    try {
      requested =
        window.localStorage.getItem(DESKTOP_MOTION_STORAGE_KEY) === "true";
    } catch {
      // The control still works for this visit when storage is unavailable.
    }
    update();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === DESKTOP_MOTION_STORAGE_KEY || event.key === null) read();
  };
  desktop.addEventListener("change", update);
  window.addEventListener("storage", storage);
  read();
  return () => {
    desktop.removeEventListener("change", update);
    window.removeEventListener("storage", storage);
  };
}

export const desktopMotionPreference = {
  getSnapshot: () => reduced,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    disconnect ??= connect();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        disconnect?.();
        disconnect = null;
      }
    };
  },
  setReduced(value: boolean) {
    requested = value;
    try {
      window.localStorage.setItem(DESKTOP_MOTION_STORAGE_KEY, String(value));
    } catch {
      // Keep the in-memory choice when persistence is blocked.
    }
    reduced = value && window.matchMedia(DESKTOP_QUERY).matches;
    document.documentElement.toggleAttribute(
      "data-desktop-reduced-motion",
      reduced,
    );
    for (const listener of listeners) listener();
  },
};

export function useDesktopReducedMotion() {
  return useSyncExternalStore(
    desktopMotionPreference.subscribe,
    desktopMotionPreference.getSnapshot,
    () => false,
  );
}
