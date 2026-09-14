"use client";

import { toBootReadingBooks } from "../boot/homepageReadingBooks";
import {
  GOLF_STOP_POSITION,
  type StacksData,
  initialScenePositionFromLocation,
} from "../data";
import { BootLoadingStatus } from "../dom/BootLoadingStatus";
import { useRoomNavigationReady } from "../input/RoomNavigation";
import { useStacks } from "../store";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

import { IllustratedTraverse } from "./IllustratedTraverse";
import { IllustrationStage } from "./IllustrationStage";
import {
  type RoomArtworkViewport,
  getRoomArtwork,
  serializeRoomBooksArtworkIdentity,
} from "./artwork";
import "./illustratedRoom.css";
import { ILLUSTRATION_POSITIONS } from "./illustrationTravelStops";
import { useIllustrationSheetFraming } from "./useIllustrationSheetFraming";

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
  navigationEnabled = true,
  transitionPosition = null,
  transitionId = 0,
  canRequest3D,
  loading = false,
  entranceSettled = true,
  onRequest3D,
  onReady,
  onUnavailable,
}: {
  data: StacksData;
  viewport: RoomArtworkViewport;
  theme: "light" | "dark";
  visible: boolean;
  navigationEnabled?: boolean;
  transitionPosition?: number | null;
  transitionId?: number;
  canRequest3D: boolean;
  loading?: boolean;
  entranceSettled?: boolean;
  onRequest3D: () => void;
  onReady: (key: string | null, matchRequired?: boolean) => void;
  onUnavailable: () => void;
}) {
  const unit = useStacks((state) => state.activeUnit);
  const locationReady = useRoomNavigationReady();
  const golfStop = useStacks((state) => state.golfStop);
  const interactingWithPanel = useStacks(
    (state) => state.panelState !== "closed" || state.modalOpen,
  );
  const [golfEntry, setGolfEntry] = useState(false);
  const golfEntryResolved = useRef(false);
  useLayoutEffect(() => {
    if (!locationReady || golfEntryResolved.current) return;
    golfEntryResolved.current = true;
    const firstUnit = document.documentElement.dataset.roomFirstUnit;
    const entry =
      firstUnit === undefined
        ? initialScenePositionFromLocation(
            window.location.pathname,
            window.location.hash,
          )
        : Number(firstUnit);
    setGolfEntry(visible && entry === GOLF_STOP_POSITION);
  }, [locationReady, visible]);
  useLayoutEffect(() => {
    if (!visible || !golfStop) setGolfEntry(false);
  }, [visible, golfStop]);
  const showGolfEntry = golfEntry && golfStop;
  const drawingUnit = showGolfEntry ? GOLF_STOP_POSITION : unit;
  const artwork = getRoomArtwork(drawingUnit, theme, viewport);
  const root = useRef<HTMLDivElement>(null);
  useIllustrationSheetFraming(root, visible && entranceSettled, drawingUnit);
  const [moving, setMoving] = useState(false);
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
    if (!locationReady) return;
    const container = root.current;
    if (moving || interactingWithPanel || !entranceSettled) {
      container
        ?.querySelectorAll("[data-artwork-key]")
        .forEach((node) => node.removeAttribute("data-room-artwork"));
      return;
    }
    if (showGolfEntry) {
      const key = `golf-overview:${theme}`;
      setReady({ revision, key });
      onReady(key, false);
      return;
    }
    const element = container?.querySelector<SVGSVGElement | HTMLImageElement>(
      "[data-illustration-selected] svg.stacks-boot-scene, [data-illustration-selected] img[data-illustration-image]",
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
  }, [
    revision,
    showGolfEntry,
    locationReady,
    unit,
    theme,
    moving,
    interactingWithPanel,
    entranceSettled,
    onReady,
    onUnavailable,
  ]);

  // About's reused SVG owns its markup. Only the hydrated, selected image
  // receives the active marker; the server drawing never enters this query.
  useLayoutEffect(() => {
    const element = root.current?.querySelector(
      "[data-illustration-selected] svg.stacks-boot-scene, [data-illustration-selected] img[data-illustration-image]",
    );
    if (
      visible &&
      readyKey &&
      !moving &&
      !interactingWithPanel &&
      entranceSettled
    ) {
      element?.setAttribute("data-room-artwork", "");
      onReady(readyKey, !showGolfEntry);
    } else element?.removeAttribute("data-room-artwork");
  }, [
    visible,
    showGolfEntry,
    readyKey,
    moving,
    interactingWithPanel,
    entranceSettled,
    onReady,
  ]);

  return (
    <>
      <div
        ref={root}
        className="room-illustration"
        aria-hidden={!visible}
        data-illustration-visible={visible ? "" : undefined}
        data-illustration-loading={loading ? "" : undefined}
        data-golf-entry={showGolfEntry ? "" : undefined}
      >
        <IllustratedTraverse
          // Travel follows the resolved destination immediately, even before
          // the entry artwork's layout effect has selected the Golf flag.
          unit={golfStop ? GOLF_STOP_POSITION : unit}
          enabled={visible && navigationEnabled}
          transitionPosition={transitionPosition}
          transitionId={transitionId}
          theme={theme}
          viewport={viewport}
          onMovingChange={setMoving}
        >
          {ILLUSTRATION_POSITIONS.map((position) => (
            <div
              key={position}
              data-illustration-position={position}
              className="room-illustration-stop"
              data-illustration-selected={
                position === drawingUnit ? "" : undefined
              }
              aria-hidden={position !== drawingUnit}
            >
              {locationReady &&
                (position === drawingUnit || entranceSettled) && (
                  <IllustrationStage
                    unitIndex={position}
                    // Offscreen shelves stay mounted so travel never remounts
                    // the row; only their fetch priority yields.
                    active={position === drawingUnit}
                    theme={theme}
                    viewport={viewport}
                    readingBooks={aboutBooks}
                    readingBookColors={data.readingBookColors}
                    unavailable={
                      position === drawingUnit && failedRevision === revision
                    }
                  />
                )}
            </div>
          ))}
        </IllustratedTraverse>
        {showGolfEntry && <IllustrationStage unitIndex={GOLF_STOP_POSITION} />}
      </div>
      <div
        className="room-illustration-actions"
        data-illustration-actions-visible={visible}
        aria-hidden={!visible}
        inert={!visible}
      >
        {loading && (
          <div className="room-loading-status">
            <BootLoadingStatus active={visible} ariaLabel="Room view" />
          </div>
        )}
        {!loading && canRequest3D && (
          <Card className="room-illustration-error">
            <div className="room-illustration-error-message" role="alert">
              <WarningCircle
                className="room-illustration-error-icon"
                size={24}
                aria-hidden="true"
              />
              <div>
                <p className="room-illustration-error-title">
                  3D view unavailable
                </p>
                <p className="room-illustration-error-description">
                  You can still browse in 2D.
                </p>
              </div>
            </div>
            <Button className="room-illustration-retry" onClick={onRequest3D}>
              <ArrowClockwise aria-hidden="true" />
              Retry 3D
            </Button>
          </Card>
        )}
      </div>
    </>
  );
}
