"use client";

import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";

import { MEET_HDR } from "./hdr";

const HDR = "(dynamic-range: high)";

/**
 * /meet's blue brighter than white, laid exactly over a solid blue mark on
 * an HDR screen. Safari shows HDR only in video, so this is a tiny looping
 * 10-bit video of the blue (MEET_HDR), the way the room's blinker does it
 * (HdrFill). It loads and plays only on an HDR screen and shows only once
 * it plays, so an SDR screen, a browser without HDR video, or a blocked
 * autoplay keeps the mark under it as it is.
 */
export function HdrPlate({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || typeof matchMedia !== "function") return;
    const screen = matchMedia(HDR);
    const start = () => {
      if (!screen.matches) return;
      if (video.getAttribute("src") !== MEET_HDR.src) video.src = MEET_HDR.src;
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
  }, []);

  return (
    <video
      ref={ref}
      className={cn("hdr", className)}
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
