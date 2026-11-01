"use client";

import { HdrFill, useHdrBlinker } from "../dom/HdrFill";
import type { AboutBootCamera } from "../scene/aboutBootPerspective";
import { useEffect, useRef } from "react";

const BLOCK = ".stacks-boot-coordination-blinker-block";

function matchBlock(plate: HTMLElement, block: SVGGraphicsElement) {
  const box = plate.parentElement?.getBoundingClientRect();
  if (!box?.width || !box.height) return;
  const rect = block.getBoundingClientRect();
  plate.style.left = `${((rect.left - box.left) / box.width) * 100}%`;
  plate.style.top = `${((rect.top - box.top) / box.height) * 100}%`;
  plate.style.width = `${(rect.width / box.width) * 100}%`;
  plate.style.height = `${(rect.height / box.height) * 100}%`;
}

/** Puts the video's blink on the block's clock. Both run the same keyframes, but
 * the block's started with the page and the video's only now. */
function shareBlink(plate: HTMLElement, block: SVGGraphicsElement) {
  const own = plate.querySelector("video")?.getAnimations()[0];
  const blink = block.getAnimations()[0];
  if (!own || !blink) return;
  void Promise.all([own.ready, blink.ready]).then(() => {
    own.startTime = blink.startTime;
  });
}

/** The HDR plate over the 2D shelf's blinker, as an element beside the SVG
 * because WebKit does not place a composited video inside foreignObject
 * reliably. The shelf scales with its box, so percentages of that box hold the
 * plate on the block with no per-frame work. A new camera moves the block inside
 * a box of the same size, which no observer sees, so it measures again. */
export function CoordinationGlyphPlate({
  camera,
}: {
  camera: AboutBootCamera;
}) {
  const hdr = useHdrBlinker();
  const plate = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = plate.current;
    const block =
      element?.parentElement?.querySelector<SVGGraphicsElement>(BLOCK);
    if (!element || !block) return;
    matchBlock(element, block);
    shareBlink(element, block);
    const resize = new ResizeObserver(() => matchBlock(element, block));
    resize.observe(element.parentElement!);
    return () => resize.disconnect();
  }, [hdr, camera]);

  return hdr ? (
    <div ref={plate} className="coordination-hdr-glyph" aria-hidden>
      <HdrFill theme="dark" />
    </div>
  ) : null;
}
