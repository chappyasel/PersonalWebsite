"use client";

// Shared state for The Stacks. Two channels with different update rates:
//
// - `progressRef` is transient — written every frame by the scroll rig and read
//   imperatively (camera, rail thumb). Nothing subscribes to it; per-frame
//   values must never flow through React state.
// - The zustand store is the reactive channel — activeUnit changes at most a
//   handful of times per traverse, everything else on discrete user actions.
import { create } from "zustand";

import type { Book } from "~/lib/books/types";

export const progressRef = { current: 0 };

export type StacksMode = "flat" | "world";

/** Mobile full-screen panel gesture state machine (Model B). Travel and all
 * input bridges freeze whenever this is not "closed". */
export type PanelState = "closed" | "opening" | "open" | "closing";

type StacksState = {
  mode: StacksMode;
  activeUnit: number;
  scrollEl: HTMLDivElement | null;
  modalOpen: boolean;
  panelState: PanelState;
  pendingBook: Book | null;
  hovered: string | null;
  /** True while the desktop EffectComposer owns the frame — scene blending
   * happens in linear HDR (dust/pools re-tune) and the DOM vignette yields
   * to the composer's. */
  postfx: boolean;
  /** Instant (undamped) jump to a unit — registered by CameraRig while the
   * canvas is mounted. Deep-links and the dev hooks use it. */
  setPostfx: (postfx: boolean) => void;
  jumpTo: ((unit: number) => void) | null;
  /** Damped travel to a unit. Sets drei's internal damp target directly
   * instead of relying on the scroll event — Next's patched pushState forces
   * a re-render that makes drei swallow the first scroll event after its
   * listener re-attaches, so single programmatic scrollLeft writes get lost. */
  travelTo: ((unit: number) => void) | null;
  setMode: (mode: StacksMode) => void;
  setActiveUnit: (activeUnit: number) => void;
  setScrollEl: (scrollEl: HTMLDivElement | null) => void;
  setModalOpen: (modalOpen: boolean) => void;
  setPanelState: (panelState: PanelState) => void;
  setPendingBook: (pendingBook: Book | null) => void;
  setHovered: (hovered: string | null) => void;
  setJumpTo: (jumpTo: ((unit: number) => void) | null) => void;
  setTravelTo: (travelTo: ((unit: number) => void) | null) => void;
};

export const useStacks = create<StacksState>((set) => ({
  mode: "flat",
  activeUnit: 0,
  scrollEl: null,
  modalOpen: false,
  panelState: "closed",
  pendingBook: null,
  hovered: null,
  postfx: false,
  setPostfx: (postfx) => set({ postfx }),
  jumpTo: null,
  travelTo: null,
  setMode: (mode) => set({ mode }),
  setActiveUnit: (activeUnit) => set({ activeUnit }),
  setScrollEl: (scrollEl) => set({ scrollEl }),
  setModalOpen: (modalOpen) => set({ modalOpen }),
  setPanelState: (panelState) => set({ panelState }),
  setPendingBook: (pendingBook) => set({ pendingBook }),
  setHovered: (hovered) => set({ hovered }),
  setJumpTo: (jumpTo) => set({ jumpTo }),
  setTravelTo: (travelTo) => set({ travelTo }),
}));

/** True while the mobile panel owns the viewport — travel must freeze. */
export function panelBusy(): boolean {
  return useStacks.getState().panelState !== "closed";
}

/** Open the mobile panel — pushes a history entry so browser back closes it
 * (mirrors the book modal's pushState-then-open pattern). */
export function openStacksPanel() {
  const s = useStacks.getState();
  if (s.panelState !== "closed" || s.modalOpen) return;
  window.history.pushState({ stacksPanel: true }, "", window.location.href);
  s.setPanelState("opening");
}

/** Close via history.back(); the popstate handler flips the state machine. */
export function closeStacksPanel() {
  const s = useStacks.getState();
  if (s.panelState !== "open" && s.panelState !== "opening") return;
  s.setPanelState("closing");
  window.history.back();
}
