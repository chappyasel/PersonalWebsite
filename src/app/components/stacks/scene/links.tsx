"use client";

// Prop navigation — the scenery props that have an honest destination become
// doors into the matching page of the site. Same house rules as the easter
// eggs (see EggTrigger): a prop only answers when its unit is the ACTIVE one
// — anywhere else the click falls through untouched so the unit tap plane
// still travels — swipes are not taps (delta gate), and hover only claims the
// store's cursor slot on the active unit.
//
// The affordance is the scene's own damped Lift: the prop rises a few
// millimetres under the pointer, the same idiom the clickable book covers and
// talk frames already use. No outlines, no tooltips, no labels — a museum at
// dawn, not a page full of buttons.
//
// Photographs share the shell (see PhotoMount): four of them carry the tweet
// they were pulled from, the rest only want the affordance.
import { type ThreeEvent } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import React from "react";

import { devSubdomainUrl } from "~/lib/util";

import { useStacks } from "../store";
import Lift from "./Lift";

/** The doors the shelf world can open. Books and Weightlifting live on their
 * own subdomains in production — the exact hrefs the placard and the flat
 * sections already link to; the manual and the routine are same-origin
 * routes; "blog" is the Medium profile the Musings posts come from. */
export type PropDestination =
  | "books"
  | "weightlifting"
  | "manual"
  | "routine"
  | "blog";

/** Off-site destinations open in a new tab (the existing onOpenUrl path the
 * talk frames and blog notebooks use); everything else is this site and
 * navigates in place. */
const NEW_TAB: PropDestination[] = ["blog"];

/** Where a prop leads: one of the site's own doors, or an arbitrary URL for
 * the handful of photographs whose source post is known. Exactly one of the
 * two — a prop with both would have an ambiguous destination. */
export type PropTarget =
  | { to: PropDestination; href?: never }
  | { to?: never; href: string };

export function propHref(to: PropDestination): string {
  const prod = process.env.NODE_ENV === "production";
  switch (to) {
    case "books":
      return prod ? "https://books.chappyasel.com" : devSubdomainUrl("books");
    case "weightlifting":
      return prod
        ? "https://weightlifting.chappyasel.com"
        : devSubdomainUrl("weightlifting");
    case "manual":
      return "/manual";
    case "routine":
      return "/routine";
    case "blog":
      return "https://medium.com/@chappyasel";
  }
}

const ORIGIN: [number, number, number] = [0, 0, 0];
const DEFAULT_LIFT: [number, number, number] = [0, 0.03, 0.02];

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
  onSelect,
  children,
}: HoverProps & { onSelect?: () => void }) {
  const setHovered = useStacks((s) => s.setHovered);
  return (
    <group
      onClick={
        onSelect
          ? (e: ThreeEvent<MouseEvent>) => {
              if ((e.delta ?? 0) > 6) return; // swipe, not a tap
              if (useStacks.getState().activeUnit !== unitIndex) return; // → travel
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (useStacks.getState().activeUnit !== unitIndex) return;
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
      >
        {children}
      </Lift>
    </group>
  );
}

/** The affordance without the door: the photographs that can't be traced to
 * a post still answer the cursor, because a shelf where three of twenty-odd
 * prints move is a shelf with three loose prints on it. */
export function HoverProp(props: HoverProps) {
  return <HoverShell {...props} />;
}

export default function PropLink(props: HoverProps & PropTarget) {
  const router = useRouter();
  return (
    <HoverShell
      {...props}
      onSelect={() => {
        // A raw href is somebody else's site by definition — always a new
        // tab, and it wins over `to` because the two never coexist.
        if (props.href !== undefined) {
          window.open(props.href, "_blank", "noopener,noreferrer");
          return;
        }
        const href = propHref(props.to);
        if (NEW_TAB.includes(props.to)) {
          window.open(href, "_blank", "noopener,noreferrer");
        } else {
          // Same-tab navigation, exactly what the placard's <Link> does (the
          // app router hands a cross-origin href to the browser itself).
          router.push(href);
        }
      }}
    />
  );
}
