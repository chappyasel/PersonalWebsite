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

import { recordFieldNoteEvent } from "./fieldNotes/progress";
import {
  type ModelArtifactHandoffEvent,
  type ModelArtifactHandoffState,
  beginModelArtifactHandoff,
  reduceModelArtifactHandoff,
} from "./modal/modelArtifactHandoff";
import { type PixelLook, pixelLookFromSearch } from "./scene/pixelArt";
import { propReactionsSuppressed } from "./scene/reactionEngagement";
import { visionProDisplayDiagnosticsController } from "./scene/visionProDisplayDiagnostics";
import { type SceneArtifactId, sceneArtifactById } from "./sceneArtifacts";
import type {
  VisionRideAssetStatus,
  VisionRideExitMethod,
  VisionRidePhase,
} from "./visionRide/visionRideState";
import {
  DEFAULT_VISION_RIDE_SESSION_PROFILE,
  EMPTY_VISION_RIDE_MODIFIERS,
  type VisionRideModifier,
  type VisionRideModifiers,
  type VisionRideSessionProfile,
} from "./visionRide/visionRideProfiles";

function recordArtifactFieldNote(id: SceneArtifactId) {
  const artifact = sceneArtifactById(id);
  if (!artifact) return;
  recordFieldNoteEvent({
    type: "artifact-opened",
    artifactId: artifact.id,
    collection: artifact.collection,
  });
}

export const progressRef = { current: 0 };

function selectVisionRidePreview(modifiers: VisionRideModifiers) {
  const variant =
    modifiers.golf
      ? "golf"
      : modifiers.redline
        ? "redline"
        : modifiers.night
          ? "3:45"
          : "retrowave";
  visionProDisplayDiagnosticsController.setVariant(variant);
}

/** High-frequency coarse-pointer signals. Consumers sample these from their
 * own animation frames; pointer movement never enters React state. */
export const touchWorldRef = {
  pointerX: 0,
  pointerY: 0,
  interactionPointerType: "unknown" as "unknown" | "touch" | "mouse" | "pen",
  travelProgress: 0,
  wakeStrength: 0,
  /** Increments once per exposed-world touch down. Meadow consumes the latest
   * revision in its frame loop so taps share the desktop pulse renderer. */
  meadowPulseRevision: 0,
  /** Visitor-controlled camera dolly. Positive values move closer. */
  zoomOffset: 0,
};

export const arrivalBeatRef = {
  aboutLampBloom: 0,
  booksCoverProgress: 1,
};

/** Right edge of the desktop unit rail's widest row, in CSS px — written by
 * UnitRail's measurement effect (and re-written after font swaps/resizes),
 * read by CameraRig to solve the About stop so the projected shelf edge
 * clears "Featured Talks" by a margin. Transient: it participates in the
 * per-frame initial-sync loop and must never re-render React. 0 = not yet
 * measured (CameraRig falls back to a conservative estimate). */
export const railRightPxRef = { current: 0 };

/** Fraction of the viewport height the mobile sheet is currently covering,
 * 0 when it is away and ~0.9 when it is expanded. Transient for the same
 * reason as `progressRef`: it changes on every frame of a drag, and the camera
 * reads it inside its own useFrame to keep the shelf centred in whatever strip
 * of screen is still visible. Written by the sheet, read by CameraRig, never
 * subscribed to. `panelState` remains the reactive channel for anything that
 * only cares whether the sheet is up at all. */
export const panelCoverageRef = { current: 0 };

/** Mobile full-screen panel gesture state machine (Model B). Travel and all
 * input bridges freeze whenever this is not "closed". */
export type PanelState = "closed" | "opening" | "open" | "closing";

type StacksState = {
  activeUnit: number;
  /** True only while the camera occupies the hidden Golf stop between Books
   * and Weightlifting. It is separate from activeUnit because the Golf stop
   * is fractional and must not replace either public section. */
  golfFocused: boolean;
  scrollEl: HTMLDivElement | null;
  modalOpen: boolean;
  /** The book modal is still covering the screen, but its exit flight has
   * begun. Mobile sheets use this interval to return behind the modal before
   * the frozen camera resumes. */
  bookModalReturning: boolean;
  inspectedArtifact: SceneArtifactId | null;
  modelArtifactHandoff: ModelArtifactHandoffState | null;
  panelState: PanelState;
  sheetDismissed: boolean;
  pendingBook: Book | null;
  /** A book the scene wants opened that is NOT in `shelfBooks` — a packed-row
   * spine. The modal bridge resolves it through the books app by id, the same
   * path a #book- deep link takes. */
  pendingBookId: string | null;
  /** Infrequently changing DOM measurements that position the desktop lens.
   * These are reactive because the canvas must immediately observe sidebar
   * hide/show and resize changes across its separate React root. */
  desktopNavRightPx: number;
  desktopDetailsLeftPx: number | null;
  /** hoverKey of the prop under the pointer, or null. Not every claimant is
   * clickable — see INERT_HOVER. */
  hovered: string | null;
  /** hoverKey of the prop currently being carried, or null. Travel must
   * freeze while a prop is in hand, or dragging one sideways scrolls the
   * whole room out from under it. */
  dragging: string | null;
  /** Coarse-pointer arbitration is discrete. Coordinates and progress remain
   * in touchWorldRef so one finger move cannot fan out through React. */
  focusedInteraction: string | null;
  pressedInteraction: string | null;
  visionRidePhase: VisionRidePhase;
  visionRideReady: boolean;
  visionRideSessionFailed: boolean;
  visionRideError: string | null;
  visionRideExitMethod: VisionRideExitMethod | null;
  visionRideStartedAt: number | null;
  visionRideModelStatus: VisionRideAssetStatus;
  visionRideAnnouncement: string;
  /** Session-only modifiers armed by authored room interactions. The ride
   * captures them at entry so its world cannot change halfway through. */
  visionRideModifiers: VisionRideModifiers;
  visionRideShakers: readonly string[];
  visionRideSessionProfile: VisionRideSessionProfile;
  /** True only while the ride curtain is opaque or the room is unmounted.
   * Room post effects and ambient camera life key off this, not the phase,
   * so they survive the visible part of the donning flight and are back
   * under the opaque return hold before the shelf is revealed. */
  visionRideRoomHidden: boolean;
  settledUnit: number | null;
  unitMapPreview: number | null;
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
  setPostfx: (postfx: boolean) => void;
  /** True while a real bloom pass is mounted. Practical apertures use this—not
   * the user's preference—to hand off cleanly when a debug override or the
   * emergency direct renderer removes bloom. */
  bloomActive: boolean;
  setBloomActive: (bloomActive: boolean) => void;
  /** The pixel-art finish (scene/pixelArt.ts). "off" is the photograph. The
   * two circuit boards on the Projects shelf switch it, and the Effect in
   * scene/Effects.tsx wipes between looks outward from `pixelOrigin`, the
   * world-space point of the board that was clicked. */
  pixelLook: PixelLook;
  pixelOrigin: readonly [number, number, number] | null;
  setPixelLook: (
    pixelLook: PixelLook,
    pixelOrigin?: readonly [number, number, number] | null,
  ) => void;
  /** Instant (undamped) jump to a unit — registered by CameraRig while the
   * canvas is mounted. Deep-links and the dev hooks use it. */
  jumpTo: ((unit: number) => void) | null;
  /** Damped travel to a unit. Sets drei's internal damp target directly
   * instead of relying on the scroll event — Next's patched pushState forces
   * a re-render that makes drei swallow the first scroll event after its
   * listener re-attaches, so single programmatic scrollLeft writes get lost. */
  travelTo: ((unit: number) => void) | null;
  setActiveUnit: (activeUnit: number) => void;
  setGolfFocused: (golfFocused: boolean) => void;
  setScrollEl: (scrollEl: HTMLDivElement | null) => void;
  setModalOpen: (modalOpen: boolean) => void;
  setBookModalReturning: (bookModalReturning: boolean) => void;
  openSceneArtifact: (id: SceneArtifactId, reducedMotion?: boolean) => void;
  openModelSceneArtifact: (id: SceneArtifactId, reducedMotion: boolean) => void;
  selectImageSceneArtifact: (id: SceneArtifactId) => void;
  dispatchModelArtifactHandoff: (event: ModelArtifactHandoffEvent) => void;
  closeSceneArtifact: () => void;
  finishSceneArtifactClose: () => void;
  setPanelState: (panelState: PanelState) => void;
  setSheetDismissed: (sheetDismissed: boolean) => void;
  setPendingBook: (pendingBook: Book | null) => void;
  setPendingBookId: (pendingBookId: string | null) => void;
  setDesktopNavRightPx: (desktopNavRightPx: number) => void;
  setDesktopDetailsLeftPx: (desktopDetailsLeftPx: number | null) => void;
  setHovered: (hovered: string | null) => void;
  setDragging: (dragging: string | null) => void;
  setFocusedInteraction: (focusedInteraction: string | null) => void;
  setPressedInteraction: (pressedInteraction: string | null) => void;
  armVisionRideModifier: (modifier: VisionRideModifier) => void;
  noteVisionRideShaker: (shakerId: string) => void;
  beginVisionRide: () => void;
  markVisionRideReady: () => void;
  startVisionRide: () => void;
  requestVisionRideExit: (method: VisionRideExitMethod) => void;
  showVisionRideReturn: () => void;
  finishVisionRide: () => void;
  failVisionRide: (error: unknown) => void;
  resetVisionRide: () => void;
  setVisionRideRoomHidden: (hidden: boolean) => void;
  setSettledUnit: (settledUnit: number | null) => void;
  setUnitMapPreview: (unitMapPreview: number | null) => void;
  setJumpTo: (jumpTo: ((unit: number) => void) | null) => void;
  setTravelTo: (travelTo: ((unit: number) => void) | null) => void;
};

export const useStacks = create<StacksState>((set) => ({
  activeUnit: 0,
  golfFocused: false,
  scrollEl: null,
  modalOpen: false,
  bookModalReturning: false,
  inspectedArtifact: null,
  modelArtifactHandoff: null,
  panelState: "closed",
  sheetDismissed: false,
  pendingBook: null,
  pendingBookId: null,
  desktopNavRightPx: 0,
  desktopDetailsLeftPx: null,
  hovered: null,
  dragging: null,
  focusedInteraction: null,
  pressedInteraction: null,
  visionRidePhase: "idle",
  visionRideReady: false,
  visionRideSessionFailed: false,
  visionRideError: null,
  visionRideExitMethod: null,
  visionRideStartedAt: null,
  visionRideModelStatus: "idle",
  visionRideAnnouncement: "",
  visionRideModifiers: EMPTY_VISION_RIDE_MODIFIERS,
  visionRideShakers: [],
  visionRideSessionProfile: DEFAULT_VISION_RIDE_SESSION_PROFILE,
  visionRideRoomHidden: false,
  settledUnit: null,
  unitMapPreview: null,
  seated: false,
  setSeated: (seated) => set({ seated }),
  postfx: false,
  setPostfx: (postfx) => set({ postfx }),
  bloomActive: false,
  setBloomActive: (bloomActive) => set({ bloomActive }),
  pixelLook:
    typeof window === "undefined"
      ? "off"
      : pixelLookFromSearch(window.location.search),
  pixelOrigin: null,
  setPixelLook: (pixelLook, pixelOrigin = null) => {
    if (pixelLook !== "off")
      recordFieldNoteEvent({ type: "pixel-look-entered", look: pixelLook });
    set({ pixelLook, pixelOrigin });
  },
  jumpTo: null,
  travelTo: null,
  setActiveUnit: (activeUnit) => set({ activeUnit }),
  setGolfFocused: (golfFocused) => set({ golfFocused }),
  setScrollEl: (scrollEl) => set({ scrollEl }),
  setModalOpen: (modalOpen) =>
    set(
      modalOpen
        ? {
            modalOpen,
            bookModalReturning: false,
            focusedInteraction: null,
            pressedInteraction: null,
          }
        : { modalOpen, bookModalReturning: false },
    ),
  setBookModalReturning: (bookModalReturning) => set({ bookModalReturning }),
  openSceneArtifact: (inspectedArtifact, reducedMotion = false) => {
    recordArtifactFieldNote(inspectedArtifact);
    set((state) => ({
      inspectedArtifact,
      modelArtifactHandoff: {
        ...beginModelArtifactHandoff(inspectedArtifact, reducedMotion),
        target:
          state.modelArtifactHandoff?.artifactId === inspectedArtifact
            ? state.modelArtifactHandoff.target
            : null,
      },
      modalOpen: true,
      focusedInteraction: null,
      pressedInteraction: null,
    }));
  },
  openModelSceneArtifact: (inspectedArtifact, reducedMotion) => {
    recordArtifactFieldNote(inspectedArtifact);
    set((state) => ({
      inspectedArtifact,
      modelArtifactHandoff: {
        ...beginModelArtifactHandoff(inspectedArtifact, reducedMotion),
        target:
          state.modelArtifactHandoff?.artifactId === inspectedArtifact
            ? state.modelArtifactHandoff.target
            : null,
      },
      modalOpen: true,
      focusedInteraction: null,
      pressedInteraction: null,
    }));
  },
  selectImageSceneArtifact: (inspectedArtifact) =>
    set((state) => ({
      inspectedArtifact,
      modelArtifactHandoff: state.modelArtifactHandoff
        ? {
            ...state.modelArtifactHandoff,
            artifactId: inspectedArtifact,
            phase: "inspecting",
            target: null,
            sourceAtTarget: true,
          }
        : null,
    })),
  dispatchModelArtifactHandoff: (event) =>
    set((state) => {
      if (!state.modelArtifactHandoff) return state;
      const modelArtifactHandoff = reduceModelArtifactHandoff(
        state.modelArtifactHandoff,
        event,
      );
      return modelArtifactHandoff
        ? { modelArtifactHandoff }
        : {
            modelArtifactHandoff: null,
            inspectedArtifact: null,
            modalOpen: false,
          };
    }),
  closeSceneArtifact: () =>
    set((state) => {
      if (!state.modelArtifactHandoff) return { inspectedArtifact: null };
      const artifact = sceneArtifactById(state.modelArtifactHandoff.artifactId);
      let modelArtifactHandoff = reduceModelArtifactHandoff(
        state.modelArtifactHandoff,
        { type: "close" },
      );
      // A photo's DOM clone is already shrinking back to its origin. Reveal
      // and return the live scene source during that same interval so there
      // is no dead beat after the overlay disappears.
      if (
        artifact?.kind === "image" &&
        modelArtifactHandoff?.phase === "crossfading-out"
      )
        modelArtifactHandoff = reduceModelArtifactHandoff(
          modelArtifactHandoff,
          { type: "source-visible" },
        );
      return {
        inspectedArtifact:
          artifact?.kind === "image" ? null : state.inspectedArtifact,
        modelArtifactHandoff,
      };
    }),
  finishSceneArtifactClose: () =>
    set((state) =>
      state.inspectedArtifact || state.modelArtifactHandoff
        ? state
        : { modalOpen: false },
    ),
  setPanelState: (panelState) =>
    set(
      panelState === "opening" || panelState === "open"
        ? { panelState, focusedInteraction: null, pressedInteraction: null }
        : { panelState },
    ),
  setSheetDismissed: (sheetDismissed) => set({ sheetDismissed }),
  setPendingBook: (pendingBook) => {
    if (pendingBook) recordFieldNoteEvent({ type: "book-preview-opened" });
    set({ pendingBook });
  },
  setPendingBookId: (pendingBookId) => {
    if (pendingBookId) recordFieldNoteEvent({ type: "book-preview-opened" });
    set({ pendingBookId });
  },
  setDesktopNavRightPx: (desktopNavRightPx) =>
    set((state) =>
      state.desktopNavRightPx === desktopNavRightPx
        ? state
        : { desktopNavRightPx },
    ),
  setDesktopDetailsLeftPx: (desktopDetailsLeftPx) =>
    set((state) =>
      state.desktopDetailsLeftPx === desktopDetailsLeftPx
        ? state
        : { desktopDetailsLeftPx },
    ),
  setHovered: (hovered) =>
    set({ hovered: propReactionsSuppressed() ? null : hovered }),
  setDragging: (dragging) => set({ dragging }),
  setFocusedInteraction: (focusedInteraction) => set({ focusedInteraction }),
  setPressedInteraction: (pressedInteraction) => set({ pressedInteraction }),
  armVisionRideModifier: (modifier) =>
    set((state) => {
      if (state.visionRideModifiers[modifier]) return state;
      const visionRideModifiers = {
        ...state.visionRideModifiers,
        [modifier]: true,
      };
      selectVisionRidePreview(visionRideModifiers);
      return { visionRideModifiers };
    }),
  noteVisionRideShaker: (shakerId) =>
    set((state) => {
      const visionRideShakers = state.visionRideShakers.includes(shakerId)
        ? state.visionRideShakers
        : [...state.visionRideShakers, shakerId];
      const visionRideModifiers =
        visionRideShakers.length >= 3
          ? { ...state.visionRideModifiers, redline: true }
          : state.visionRideModifiers;
      if (
        visionRideModifiers.redline &&
        !state.visionRideModifiers.redline
      )
        selectVisionRidePreview(visionRideModifiers);
      return {
        visionRideShakers,
        visionRideModifiers,
      };
    }),
  beginVisionRide: () =>
    set((state) => {
      if (
        state.visionRidePhase !== "idle" ||
        state.visionRideSessionFailed
      )
        return state;
      selectVisionRidePreview(state.visionRideModifiers);
      visionProDisplayDiagnosticsController.setEnabled(true);
      return {
        visionRidePhase: "donning",
        visionRideReady: false,
        visionRideError: null,
        visionRideExitMethod: null,
        visionRideStartedAt: null,
        visionRideModelStatus: "loading",
        visionRideAnnouncement: "Putting on Apple Vision Pro.",
        visionRideSessionProfile: {
          ...state.visionRideModifiers,
          pixelLook: state.pixelLook,
        },
        visionRideRoomHidden: false,
        hovered: null,
        dragging: null,
        focusedInteraction: null,
        pressedInteraction: null,
      };
    }),
  markVisionRideReady: () =>
    set((state) =>
      state.visionRidePhase === "donning"
        ? { visionRideReady: true, visionRideModelStatus: "ready" }
        : state,
    ),
  startVisionRide: () =>
    set((state) =>
      state.visionRidePhase === "donning" && state.visionRideReady
        ? {
            visionRidePhase: "cruising",
            visionRideStartedAt: performance.now(),
            visionRideAnnouncement: "Apple Vision Pro ride started.",
          }
        : state,
    ),
  requestVisionRideExit: (visionRideExitMethod) =>
    set((state) =>
      state.visionRidePhase === "idle" ||
      state.visionRidePhase === "doffing" ||
      state.visionRidePhase === "returning"
        ? state
        : {
            visionRidePhase: "doffing",
            visionRideExitMethod,
            visionRideAnnouncement: "Removing Apple Vision Pro.",
          },
    ),
  showVisionRideReturn: () =>
    set((state) =>
      state.visionRidePhase === "doffing"
        ? { visionRidePhase: "returning" }
        : state,
    ),
  finishVisionRide: () =>
    set({
      visionRidePhase: "idle",
      visionRideReady: false,
      visionRideExitMethod: null,
      visionRideStartedAt: null,
      visionRideModelStatus: "idle",
      visionRideAnnouncement: "Apple Vision Pro removed.",
      visionRideRoomHidden: false,
    }),
  failVisionRide: (error) =>
    set((state) => ({
      visionRideSessionFailed: true,
      visionRideError:
        error instanceof Error ? error.message : "Vision ride failed to load",
      visionRideModelStatus: "failed",
      visionRideExitMethod: "error",
      visionRidePhase: state.visionRidePhase === "idle" ? "idle" : "doffing",
      visionRideAnnouncement:
        "The Apple Vision Pro ride could not load. The shelf has been restored.",
    })),
  resetVisionRide: () =>
    set({
      visionRidePhase: "idle",
      visionRideReady: false,
      visionRideExitMethod: null,
      visionRideStartedAt: null,
      visionRideModelStatus: "idle",
      visionRideRoomHidden: false,
    }),
  setVisionRideRoomHidden: (visionRideRoomHidden) =>
    set((state) =>
      state.visionRideRoomHidden === visionRideRoomHidden
        ? state
        : { visionRideRoomHidden },
    ),
  setSettledUnit: (settledUnit) => set({ settledUnit }),
  setUnitMapPreview: (unitMapPreview) => set({ unitMapPreview }),
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

/** Set the mobile sheet detent from controls outside PlacardLayer. Dismissing
 * an expanded sheet must close its panel state too, or world travel stays
 * frozen behind a sheet that is no longer visible. */
export function setStacksSheetDismissed(dismissed: boolean) {
  const state = useStacks.getState();
  state.setSheetDismissed(dismissed);
  if (dismissed) closeStacksPanel();
}
