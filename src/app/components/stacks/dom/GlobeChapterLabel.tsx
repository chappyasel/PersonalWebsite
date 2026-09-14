"use client";

// The near globe keeps its own label while prop focus hides the room chrome.
import {
  type GlobeChapterHover,
  globeChapterLabel,
  globeLivedPlaceStatus,
  globeVisitedPlaceStatus,
  useGlobeChapterHover,
} from "../scene/globeChapterHover";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import { clampPortalLabelY } from "./portalLabelPlacement";

// Match PortalLabel's 320ms fade, including its switch and removal tails.
const SWITCH_MS = 340;
const EXIT_MS = 420;

function markerKey(mark: GlobeChapterHover | null) {
  return mark ? `${mark.kind}:${mark.index}` : null;
}

export default function GlobeChapterLabel() {
  const hover = useGlobeChapterHover();
  const node = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<GlobeChapterHover | null>(null);
  const [visible, setVisible] = useState(false);
  const latestHover = useRef(hover);
  const shownRef = useRef<GlobeChapterHover | null>(null);
  const key = markerKey(hover);

  useLayoutEffect(() => {
    latestHover.current = hover;
  }, [hover]);

  useEffect(() => {
    let frame = 0;
    setVisible(false);
    const timer = window.setTimeout(
      () => {
        const next = latestHover.current;
        shownRef.current = next;
        setShown(next);
        if (next) {
          // Allow the positioned transparent node to paint before entering.
          frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => setVisible(true));
          });
        }
      },
      key === null
        ? EXIT_MS
        : shownRef.current && markerKey(shownRef.current) !== key
          ? SWITCH_MS
          : 0,
    );
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [key]);

  // Coordinate updates follow the same mark without restarting its fade.
  const displayed = shown && key === markerKey(shown) ? hover : shown;

  useLayoutEffect(() => {
    if (!displayed) return;
    const place = () => {
      const element = node.current;
      if (!element) return;
      const half = element.offsetWidth / 2;
      element.style.left = `${Math.max(12 + half, Math.min(window.innerWidth - 12 - half, displayed.x))}px`;
      element.style.top = `${clampPortalLabelY(displayed.y, element.offsetHeight, window.innerHeight, null)}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [displayed]);

  if (!displayed) return null;
  const chapter = displayed.kind === "chapter";
  const single = chapter && displayed.chapters.length === 1;
  return (
    <div
      ref={node}
      data-stacks-globe-label
      inert={!visible}
      role="status"
      aria-live="polite"
      style={
        {
          left: displayed.x,
          top: displayed.y - 10,
          transform: visible
            ? "translate(-50%, -100%) scale(1)"
            : "translate(-50%, calc(-100% + 6px)) scale(0.96)",
          transformOrigin: "bottom center",
          "--portal-label-opacity": visible ? "1" : "0",
        } as React.CSSProperties
      }
      className="field-notes-glass-tooltip pointer-events-none fixed z-30 w-max max-w-[min(300px,calc(100vw-24px))] rounded-2xl border px-3.5 py-2.5 backdrop-blur-xl backdrop-saturate-150"
    >
      <span className="flex min-w-0 items-center gap-2 text-left font-serif text-[14px] leading-[1.25]">
        <span className="flex min-w-0 flex-col">
          <span className="min-w-0 whitespace-normal break-words text-[15px] font-semibold">
            {chapter
              ? globeChapterLabel(displayed.chapters)
              : displayed.kind === "visited"
                ? `${displayed.place.flag} ${displayed.place.name}`
                : `🏡 ${displayed.place.name}`}
          </span>
          {chapter && !single && (
            <span className="mt-0.5 text-[13px] leading-[1.3] text-white/60">
              {`+${displayed.chapters.length - 1} more nearby`}
            </span>
          )}
          <span className="mt-0.5 min-w-0 whitespace-normal break-words text-[13px] leading-[1.3] text-white/60">
            {displayed.kind === "lived"
              ? globeLivedPlaceStatus(displayed.place)
              : displayed.kind === "visited"
                ? globeVisitedPlaceStatus()
                : "The AI Collective"}
          </span>
          {chapter && (
            <span className="mt-1 text-[13px] leading-[1.3]">
              {single ? "View chapter" : "View chapters"}
            </span>
          )}
        </span>
        {chapter && (
          <ArrowSquareOutIcon
            size={15}
            weight="bold"
            className="shrink-0 self-center"
            aria-hidden
          />
        )}
      </span>
    </div>
  );
}
