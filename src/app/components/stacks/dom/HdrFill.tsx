"use client";

import {
  type CrossingTheme,
  coordinationCrossing,
} from "../scene/coordinationCrossing";
import { useEffect, useRef, useSyncExternalStore } from "react";

const HDR = "(dynamic-range: high)";

function subscribeHdrBlinker(listener: () => void) {
  const screen = matchMedia(HDR);
  screen.addEventListener("change", listener);
  const unsubscribe = coordinationCrossing.subscribe(listener);
  return () => {
    screen.removeEventListener("change", listener);
    unsubscribe();
  };
}

const readHdrBlinker = () =>
  coordinationCrossing.getSnapshot().hdrBlinker &&
  matchMedia(HDR).matches;

/** Whether this screen should get the blinker's HDR plates at all. Everything
 * that exists only for them hangs off this, so an SDR screen or the Scene
 * Diagnostics switch skips the video and the per-frame work. */
export const useHdrBlinker = () =>
  useSyncExternalStore(subscribeHdrBlinker, readHdrBlinker, () => false);

/** A block's orange brighter than white, on an HDR screen. Safari shows HDR
 * only in video, so the fill is a tiny looping 10-bit video of the accent at
 * 800 nits, about 4x SDR white (public/hdr, from `pnpm generate:hdr-accent`).
 *
 * It loads and plays only on an HDR screen, and shows only once it is playing:
 * an SDR screen, a browser without HDR video, or a blocked autoplay keeps the
 * block underneath it, unchanged. `theme` is the accent the block is drawn in,
 * not the site's theme: the orb's block and the crossing's are the dark accent
 * in both. */
export function HdrFill({
  theme,
  className = "",
}: {
  theme: CrossingTheme;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const screen = matchMedia(HDR);
    const start = () => {
      if (!screen.matches) return;
      const src = `/hdr/accent-${theme}.mp4`;
      if (video.getAttribute("src") !== src) {
        delete video.dataset.playing;
        video.src = src;
      }
      video.muted = true;
      void video.play().catch(() => undefined);
    };
    const playing = () => {
      video.dataset.playing = "";
    };
    video.addEventListener("playing", playing);
    screen.addEventListener("change", start);
    start();
    return () => {
      video.removeEventListener("playing", playing);
      screen.removeEventListener("change", start);
    };
  }, [theme]);

  return (
    <video
      ref={ref}
      className={`hdr ${className}`}
      preload="none"
      loop
      muted
      playsInline
      disablePictureInPicture
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}
