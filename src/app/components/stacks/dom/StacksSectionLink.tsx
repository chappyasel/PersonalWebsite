"use client";

import { UNITS, type UnitSlug, unitUrlForLocation } from "../data";
import { closeStacksPanel, useStacks } from "../store";
import type { MouseEvent, ReactNode } from "react";

function isPlainPrimaryClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function StacksSectionLink({
  children,
  unit: unitSlug,
}: {
  children: ReactNode;
  unit: UnitSlug;
}) {
  const unitIndex = UNITS.findIndex((unit) => unit.slug === unitSlug);
  const unit = UNITS[unitIndex];
  if (!unit) return children;

  const href = `#${unit.urlSlug ?? unit.slug}`;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || !isPlainPrimaryClick(event)) return;

    const { modalOpen, panelState, travelTo } = useStacks.getState();
    // With no live world, leave the native fragment link alone. It scrolls the
    // semantic flat page and remains useful when WebGL is unavailable.
    if (!travelTo || modalOpen || panelState === "closing") return;

    event.preventDefault();
    useStacks.getState().setFocusedInteraction(null);
    const pushSectionHistory = () => {
      window.history.pushState(
        null,
        "",
        unitUrlForLocation(
          window.location.pathname,
          window.location.search,
          unitIndex,
        ),
      );
    };

    if (panelState === "open" || panelState === "opening") {
      closeStacksPanel();
      travelTo(unitIndex);
      const unsubscribe = useStacks.subscribe((state) => {
        if (state.panelState !== "closed") return;
        unsubscribe();
        pushSectionHistory();
      });
      return;
    }

    pushSectionHistory();
    travelTo(unitIndex);
  };

  return (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  );
}
