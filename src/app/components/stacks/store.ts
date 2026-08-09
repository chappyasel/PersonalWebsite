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

type StacksState = {
  mode: StacksMode;
  activeUnit: number;
  scrollEl: HTMLDivElement | null;
  modalOpen: boolean;
  pendingBook: Book | null;
  hovered: string | null;
  /** Instant (undamped) jump to a unit — registered by CameraRig while the
   * canvas is mounted. Deep-links and the dev hooks use it. */
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
  pendingBook: null,
  hovered: null,
  jumpTo: null,
  travelTo: null,
  setMode: (mode) => set({ mode }),
  setActiveUnit: (activeUnit) => set({ activeUnit }),
  setScrollEl: (scrollEl) => set({ scrollEl }),
  setModalOpen: (modalOpen) => set({ modalOpen }),
  setPendingBook: (pendingBook) => set({ pendingBook }),
  setHovered: (hovered) => set({ hovered }),
  setJumpTo: (jumpTo) => set({ jumpTo }),
  setTravelTo: (travelTo) => set({ travelTo }),
}));
