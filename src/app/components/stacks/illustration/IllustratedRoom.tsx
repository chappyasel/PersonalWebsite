"use client";

import { toBootReadingBooks } from "../boot/homepageReadingBooks";
import { GOLF_STOP_POSITION, type StacksData } from "../data";
import { useStacks } from "../store";
import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";

import { IllustrationStage } from "./IllustrationStage";
import {
  type RoomArtworkViewport,
  getRoomArtwork,
  serializeRoomBooksArtworkIdentity,
} from "./artwork";
import "./illustratedRoom.css";

export function illustrationGeometryKey({
  revision,
  unit,
  theme,
  rect,
  viewport,
}: {
  revision: string;
  unit: number;
  theme: "light" | "dark";
  rect: Pick<DOMRectReadOnly, "x" | "y" | "width" | "height">;
  viewport: readonly [number, number, number];
}) {
  if (
    ![rect.x, rect.y, rect.width, rect.height, ...viewport].every(
      Number.isFinite,
    ) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return null;
  return JSON.stringify([
    revision,
    unit,
    theme,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    ...viewport,
  ]);
}

/** An image layer only. PlacardLayer continues to own every content panel. */
export default function IllustratedRoom({
  data,
  theme,
  viewport,
  visible,
  canRequest3D,
  onRequest3D,
  onReady,
  onUnavailable,
}: {
  data: StacksData;
  viewport: RoomArtworkViewport;
  theme: "light" | "dark";
  visible: boolean;
  canRequest3D: boolean;
  onRequest3D: () => void;
  onReady: (key: string | null) => void;
  onUnavailable: () => void;
}) {
  const unit = useStacks((state) => state.activeUnit);
  const golfStop = useStacks((state) => state.golfStop);
  const drawingUnit = golfStop ? GOLF_STOP_POSITION : unit;
  const artwork = getRoomArtwork(drawingUnit, theme, viewport);
  const root = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const [failedRevision, setFailedRevision] = useState<string | null>(null);
  const [ready, setReady] = useState<{ revision: string; key: string } | null>(
    null,
  );
  const aboutBooks = toBootReadingBooks(data.readingBooks);
  const revision =
    unit === 0
      ? JSON.stringify(["about", theme, aboutBooks, data.readingBookColors])
      : artwork
        ? `${artwork.sourceRevision}:${artwork.sourceFingerprint}:${artwork.src}:${unit === 1 ? serializeRoomBooksArtworkIdentity(data) : ""}`
        : `missing:${drawingUnit}:${theme}`;
  const readyKey = ready?.revision === revision ? ready.key : null;

  useLayoutEffect(() => {
    onReady(null);
    const container = root.current;
    const element = container?.querySelector<SVGSVGElement | HTMLImageElement>(
      "svg.stacks-boot-scene, img[data-illustration-image]",
    );
    element?.removeAttribute("data-room-artwork");
    if (!element) {
      onUnavailable();
      return;
    }
    let disposed = false;
    let decoded = false;
    const measure = () => {
      if (disposed || !decoded) return;
      const rect = element.getBoundingClientRect();
      const key = illustrationGeometryKey({
        revision,
        unit,
        theme,
        rect,
        viewport: [
          window.innerWidth,
          window.innerHeight,
          window.devicePixelRatio,
        ],
      });
      if (!key) {
        setReady(null);
        onReady(null);
        return;
      }
      // Publish the matching DOM markers before waking the scene bridge.
      if (visibleRef.current) element.dataset.roomArtwork = "";
      element.dataset.artworkKey = key;
      element.dataset.unit = String(unit);
      element.dataset.theme = theme;
      if (container?.hasAttribute("data-illustration-visible"))
        element.setAttribute("data-room-artwork", "");
      setReady({ revision, key });
      onReady(key);
    };
    const sources =
      element instanceof HTMLImageElement
        ? [element]
        : [...element.querySelectorAll("image")].map((image) => {
            const decoder = new Image();
            decoder.src =
              image.getAttribute("href") ??
              image.getAttribute("xlink:href") ??
              "";
            return decoder;
          });
    void Promise.all(sources.map((image) => image.decode()))
      .then(() => {
        decoded = true;
        measure();
      })
      .catch(() => {
        if (!disposed) {
          setFailedRevision(revision);
          onUnavailable();
          onReady(null);
        }
      });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (container) observer.observe(container);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      onReady(null);
    };
  }, [revision, unit, theme, onReady, onUnavailable]);

  // About's reused SVG owns its markup. Only the hydrated, selected image
  // receives the active marker; the server drawing never enters this query.
  useLayoutEffect(() => {
    const element = root.current?.querySelector(
      "svg.stacks-boot-scene, img[data-illustration-image]",
    );
    if (visible && readyKey) {
      element?.setAttribute("data-room-artwork", "");
      onReady(readyKey);
    } else element?.removeAttribute("data-room-artwork");
  }, [visible, readyKey, onReady]);

  return (
    <div
      ref={root}
      className="room-illustration"
      aria-hidden={!visible}
      data-illustration-visible={visible ? "" : undefined}
    >
      <IllustrationStage
        unitIndex={drawingUnit}
        theme={theme}
        viewport={viewport}
        readingBooks={aboutBooks}
        readingBookColors={data.readingBookColors}
        unavailable={failedRevision === revision}
      />
      {visible && canRequest3D && (
        <div className="room-illustration-actions">
          <Button variant="outline" size="sm" onClick={onRequest3D}>
            Enter 3D room
          </Button>
        </div>
      )}
    </div>
  );
}
