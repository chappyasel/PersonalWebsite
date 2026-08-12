"use client";

// Shared state for the homepage 3D scene. Two channels with different update rates:
//
// - `progressRef` is transient — written every frame by the scroll rig and read
//   imperatively (camera, rail thumb). Nothing subscribes to it; per-frame
//   values must never flow through React state.
// - The zustand store is the reactive channel — activeUnit changes at most a
//   handful of times per traverse, everything else on discrete user actions.
import { create } from "zustand";

import type { Book } from "~/lib/books/types";

export const progressRef = { current: 0 };

/** Fraction of the viewport height the mobile sheet is currently covering,
 * 0 when it is away and ~0.9 when it is expanded. Transient for the same
 * reason as `progressRef`: it changes on every frame of a drag, and the camera
 * reads it inside its own useFrame to keep the shelf centred in whatever strip
 * of screen is still visible. Written by the sheet, read by CameraRig, never
 * subscribed to. `panelState` remains the reactive channel for anything that
 * only cares whether the sheet is up at all. */
export const panelCoverageRef = { current: 0 };

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
  /** hoverKey of the prop under the pointer, or null. Not every claimant is
   * clickable — see INERT_HOVER. */
  hovered: string | null;
  /** hoverKey of the prop currently being carried, or null. Travel must
   * freeze while a prop is in hand, or dragging one sideways scrolls the
   * whole room out from under it. */
  dragging: string | null;
  /** True while the visitor is sitting in the About reading chair. The module
   * `scene/seated.ts` is the source of truth — the camera and the sky read it
   * every frame and must never go through React — and SitChair mirrors it
   * here so the DOM side (placard, rail, any "press Escape" affordance) can
   * react to it at all. Never write this directly: call requestSeat /
   * leaveSeat and let the mirror follow. */
  seated: boolean;
  setSeated: (seated: boolean) => void;
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
  setDragging: (dragging: string | null) => void;
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
  dragging: null,
  seated: false,
  setSeated: (seated) => set({ seated }),
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
  setDragging: (dragging) => set({ dragging }),
  setJumpTo: (jumpTo) => set({ jumpTo }),
  setTravelTo: (travelTo) => set({ travelTo }),
}));

/** Hover keys carrying this prefix open nothing. The photographs claim the
 * slot so they can lift under the pointer, but a tap on the active unit is a
 * desktop no-op — a pointer cursor over one would promise a click that never
 * lands. */
export const INERT_HOVER = "photo:";

/** hoverKey prefix for props you can pick up. They earn an open-hand cursor
 * rather than the pointer finger — a finger promises navigation, and these
 * go nowhere. */
export const GRAB_HOVER = "grab:";

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
