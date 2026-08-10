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

export default function PropLink({
  unitIndex,
  to,
  hoverKey,
  base = ORIGIN,
  lift = DEFAULT_LIFT,
  children,
}: {
  unitIndex: number;
  to: PropDestination;
  /** Unique across the whole scene — it owns the store's single hover slot. */
  hoverKey: string;
  /** Rest position, when the link also owns the prop's placement. */
  base?: [number, number, number];
  /** Hover displacement: a few mm up and toward the viewer. */
  lift?: [number, number, number];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const setHovered = useStacks((s) => s.setHovered);
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if ((e.delta ?? 0) > 6) return; // swipe, not a tap
        if (useStacks.getState().activeUnit !== unitIndex) return; // → travel
        e.stopPropagation();
        const href = propHref(to);
        if (NEW_TAB.includes(to)) {
          window.open(href, "_blank", "noopener,noreferrer");
        } else {
          // Same-tab navigation, exactly what the placard's <Link> does (the
          // app router hands a cross-origin href to the browser itself).
          router.push(href);
        }
      }}
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
      <Lift hoverKey={hoverKey} base={base} offset={lift}>
        {children}
      </Lift>
    </group>
  );
}
