"use client";

// Prop navigation — scenery props with an honest destination become Portals
// into the matching page of the site. A visible nearest-hit prop answers even
// while the traverse is rounding into its neighboring unit; `activeUnits`
// remains ownership metadata, not an interaction partition. Swipes are not
// taps (delta gate), and inert scenery never claims the cursor slot.
//
// The affordance is the scene's own damped Lift: the prop rises a few
// millimetres under the pointer and nods toward you, the same idiom the
// clickable book covers and talk frames already use. Portals and explicit local
// actions add one restrained outcome label after dwell; inert scenery and
// quiet eggs never do.
//
// WHY THE OPEN RIDES A WINDOW POINTERUP AND NOT r3f's onClick.
// r3f gates every click-type event on the object having been in the hit list
// captured at POINTERDOWN (`internal.initialHits`), and pointerdown does not
// dispatch reliably with the scene connected to drei's ScrollControls —
// Grabbable.tsx:262-273 measured a mesh whose onPointerOver fired every time
// and which never received down, up or click. Worse, `initialHits` is never
// cleared, so a failed pointerdown leaves it STALE rather than empty and the
// click lands on whatever the last dispatching pointerdown saw. The symptom is
// "links work intermittently, on the wrong prop", and a synthetic
// mouse.down()/mouse.up() DOES dispatch, so it passes every automated check
// while being dead under a real trackpad. A window listener keyed off the
// store's hover slot consults none of that machinery. The r3f handler stays,
// but only to swallow the tap so it cannot also reach the unit travel plane.
import {
  HOMEPAGE_PORTAL_ACTIVATED_EVENT,
  capture,
} from "../../../../lib/analytics";
import { recordSheetOrigin } from "~/components/daylight/sheetOrigin";

import { UNITS } from "../data";
import { recordFieldNoteEvent } from "../fieldNotes/progress";
import { useStacks } from "../store";
import { type ThreeEvent } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef } from "react";
import type * as THREE from "three";

import Lift from "./Lift";
import {
  type PortalSpec,
  type PropDestination,
  destinationFor,
  registerSceneInteraction,
} from "./interactionRegistry";

/** The portals the shelf world can open. Books and Weightlifting live on their
 * own subdomains in production — the exact hrefs the placard and the flat
 * sections already link to; the manual and the routine are same-origin
 * routes; "blog" is the Medium profile the Musings posts come from. */
export type { PropDestination } from "./interactionRegistry";

/** Off-site destinations open in a new tab (the existing onOpenUrl path the
 * talk frames and blog notebooks use); everything else is this site and
 * navigates in place. */
const NEW_TAB: PropDestination[] = ["blog"];

/** Where a prop leads: one of the site's own portals, or an arbitrary URL for
 * the photographs whose source post is known. Exactly one of the two — a prop
 * with both would have an ambiguous destination. */
export type PropTarget =
  | { to: PropDestination; href?: never }
  | {
      to?: never;
      href: string;
      /** Arbitrary URLs cannot infer honest outcome copy. */
      label: string;
      external?: boolean;
    };

export function propHref(to: PropDestination): string {
  return destinationFor(to).href;
}

type PortalAnalyticsContext = {
  portalId: string;
  unitIndex: number;
};

function portalFor(target: PropTarget, run: () => void): PortalSpec {
  if (target.href !== undefined) {
    return {
      kind: "portal",
      label: target.label,
      href: target.href,
      external: target.external ?? true,
      run,
    };
  }
  const destination = destinationFor(target.to);
  return { kind: "portal", ...destination, run };
}

const ORIGIN: [number, number, number] = [0, 0, 0];
const DEFAULT_LIFT: [number, number, number] = [0, 0.03, 0.02];

/** Open a prop's destination. Shared with Grabbable, which offers the same
 * portals from a prop you can also pick up — a press that never moved is a
 * click, and a prop should not have to choose between being a handle and
 * being a portal. */
export function useOpenTarget(): (
  target: PropTarget,
  analyticsContext: PortalAnalyticsContext,
) => void {
  const router = useRouter();
  // Stable across renders: Grabbable holds it in a window-listener effect, and
  // a fresh closure per render would tear the whole gesture down and rebuild
  // it on every parent re-render.
  return useCallback(
    (target: PropTarget, analyticsContext: PortalAnalyticsContext) => {
      const section = UNITS[analyticsContext.unitIndex]?.slug;
      recordFieldNoteEvent({
        type: "portal-activated",
        portalId: analyticsContext.portalId,
        unitIndex: analyticsContext.unitIndex,
        // Route names for the site's own portals so Open House counts the
        // same destination identically across dev and production hosts.
        destination: target.href ?? target.to,
      });
      if (section) {
        // Keep the original PostHog event and property names as one historical
        // contract. Emitting only this event avoids duplicate activation counts.
        capture(HOMEPAGE_PORTAL_ACTIVATED_EVENT, {
          door_id: analyticsContext.portalId,
          section,
          destination: target.href !== undefined ? "external" : target.to,
        });
      }
      // A raw href is somebody else's site by definition — always a new tab,
      // and it wins over `to` because the two never coexist.
      if (target.href !== undefined) {
        window.open(target.href, "_blank", "noopener,noreferrer");
        return;
      }
      const href = propHref(target.to);
      if (NEW_TAB.includes(target.to)) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        // Same-tab navigation, exactly what the placard's <Link> does (the app
        // router hands a cross-origin href to the browser itself). The
        // intercepted sheet pops from its source: a prop is shader geometry
        // with no DOM box, so the gesture's own pointer-down stands in.
        if (down.ok || down.x || down.y) {
          recordSheetOrigin({
            left: down.x - 70,
            top: down.y - 90,
            width: 140,
            height: 180,
          });
        }
        router.push(href);
      }
    },
    [router],
  );
}

// ---------------------------------------------------------------------------
// The one gesture listener the whole scene's prop links share
// ---------------------------------------------------------------------------

/** Every mounted shell that has somewhere to go, by hoverKey. One shared pair
 * of window listeners rather than a pair per prop: there are several dozen of
 * these in the world and they all ask the same three questions. */
const portals = new Map<string, { unitIndex: number; open: () => void }>();

/** Pointerdown position, so a drag across a prop is not a click on it. The
 * same 6px gate r3f's own `event.delta` uses. */
const down = { x: 0, y: 0, ok: false, touchPortal: null as string | null };
const DRAG_PX = 6;

/** When the window path last opened something. r3f's `click` is dispatched
 * from the DOM click event, which fires AFTER pointerup — so by the time the
 * scene handler runs, the portal may already be open, and its only remaining
 * job is to stop the tap reaching the unit travel plane behind it. */
let opened = 0;

/** True while a scene handler should defer to the open that just happened. */
function justOpened(): boolean {
  return performance.now() - opened < 400;
}

function onWindowDown(e: PointerEvent) {
  if (e.pointerType === "touch") {
    down.ok = false;
    down.touchPortal = null;
    return;
  }
  down.x = e.clientX;
  down.y = e.clientY;
  down.ok = e.isPrimary && e.button === 0;
  down.touchPortal = null;
}

function onWindowUp(e: PointerEvent) {
  if (e.pointerType === "touch") return;
  if (!down.ok) return;
  down.ok = false;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX) return;
  const s = useStacks.getState();
  // A prop in hand, an open panel or an open modal all mean this gesture was
  // about something else.
  if (s.dragging || s.modalOpen || s.panelState !== "closed") return;
  // The hover slot is only refreshed while the pointer is over the element
  // r3f is connected to (drei's scroll container). Move onto the DOM placard,
  // which sits ABOVE the canvas, and no pointerout ever fires — the slot goes
  // stale, and without this check a click on a placard link would also open
  // whichever prop the pointer left behind.
  const el = s.scrollEl;
  if (el && e.target instanceof Node && !el.contains(e.target)) return;
  const key = s.hovered;
  down.touchPortal = null;
  const portal = key ? portals.get(key) : undefined;
  if (!portal) return;
  opened = performance.now();
  portal.open();
}

let listenerOwners = 0;
function retainWindowListeners() {
  if (typeof window === "undefined") return;
  listenerOwners += 1;
  if (listenerOwners === 1) {
    window.addEventListener("pointerdown", onWindowDown);
    window.addEventListener("pointerup", onWindowUp);
  }
  return () => {
    listenerOwners = Math.max(0, listenerOwners - 1);
    if (listenerOwners !== 0) return;
    window.removeEventListener("pointerdown", onWindowDown);
    window.removeEventListener("pointerup", onWindowUp);
    down.ok = false;
  };
}

type HoverProps = {
  unitIndex: number;
  /** Unique across the whole scene — it owns the store's single hover slot. */
  hoverKey: string;
  /** Rest position, when the wrapper also owns the prop's placement. */
  base?: [number, number, number];
  /** Hover displacement: a few mm up and toward the viewer. */
  lift?: [number, number, number];
  /** Rest tilt, and how far the hover eases it toward level. Only the
   * photographs use these; see Lift. */
  rest?: [number, number, number];
  settle?: number;
  grow?: number;
  /** Radians of automatic nod. Lift decides on its own unless this says
   * otherwise; 0 refuses. */
  tip?: number;
  children: React.ReactNode;
};

/** The house rules, in one place. `onSelect` is what a tap does — a wrapper
 * with nothing to open attaches no click handler at all, so the event keeps
 * travelling to the unit tap plane instead of dying on the prop. */
function HoverShell({
  unitIndex,
  hoverKey,
  base = ORIGIN,
  lift = DEFAULT_LIFT,
  rest,
  settle,
  grow,
  tip,
  onSelect,
  portalTarget,
  children,
}: HoverProps & { onSelect?: () => void; portalTarget?: PropTarget }) {
  const root = useRef<THREE.Group>(null);
  const setHovered = useStacks((s) => s.setHovered);
  // The handler is re-created on every render (callers pass inline closures),
  // and the registry must not churn with it — a ref keeps the registration
  // itself mount-stable while the behaviour stays current.
  const select = useRef(onSelect);
  select.current = onSelect;
  const hasPortal = !!onSelect;
  useEffect(() => {
    if (!hasPortal) return;
    const releaseListeners = retainWindowListeners();
    const entry = { unitIndex, open: () => select.current?.() };
    portals.set(hoverKey, entry);
    return () => {
      // Only if it is still ours: a remount can register the replacement
      // before the outgoing effect tears down.
      if (portals.get(hoverKey) === entry) portals.delete(hoverKey);
      releaseListeners?.();
    };
  }, [hoverKey, unitIndex, hasPortal]);
  useEffect(() => {
    if (!onSelect || !portalTarget || !root.current) return;
    return registerSceneInteraction({
      id: hoverKey,
      root: root.current,
      activeUnits: [unitIndex],
      activation: portalFor(portalTarget, () => select.current?.()),
      hover: { kind: "lift" },
    });
  }, [portalTarget, hoverKey, onSelect, unitIndex]);
  return (
    <group
      ref={root}
      onClick={
        onSelect
          ? (e: ThreeEvent<MouseEvent>) => {
              if (
                (e as unknown as { pointerType?: string }).pointerType ===
                "touch"
              )
                return;
              if ((e.delta ?? 0) > 6) return; // swipe, not a tap
              // Swallow it either way, so the tap cannot ALSO reach the unit
              // travel plane behind the prop…
              e.stopPropagation();
              // …but the window pointerup above has usually already opened
              // the portal by now, and opening it twice is two tabs.
              if (justOpened()) return;
              onSelect();
            }
          : undefined
      }
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(hoverKey);
      }}
      onPointerOut={() => {
        // Clear only our own hover — a late out must never drop another
        // prop's freshly claimed slot (same rule as the book covers).
        if (useStacks.getState().hovered === hoverKey) setHovered(null);
      }}
    >
      <Lift
        hoverKey={hoverKey}
        base={base}
        offset={lift}
        rest={rest}
        settle={settle}
        grow={grow}
        tip={tip}
      >
        {children}
      </Lift>
    </group>
  );
}

/** The affordance without the portal: the photographs that can't be traced to
 * a post still answer the cursor, because a shelf where three of twenty-odd
 * prints move is a shelf with three loose prints on it. */
export function HoverProp(props: HoverProps) {
  return <HoverShell {...props} />;
}

export default function PropLink(props: HoverProps & PropTarget) {
  const open = useOpenTarget();
  const select = useCallback(
    () =>
      open(props as PropTarget, {
        portalId: props.hoverKey,
        unitIndex: props.unitIndex,
      }),
    [open, props],
  );
  return (
    <HoverShell
      {...props}
      onSelect={select}
      portalTarget={props as PropTarget}
    />
  );
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  // Which props actually have a portal, and under which hover key. The DOM says
  // nothing about any of this — the shells deliberately re-render nothing —
  // and "is this prop clickable" is otherwise only answerable by clicking it.
  window.__links = () =>
    [...portals].map(([key, d]) => ({ key, unit: d.unitIndex }));
}

declare global {
  interface Window {
    __links?: () => { key: string; unit: number }[];
  }
}
