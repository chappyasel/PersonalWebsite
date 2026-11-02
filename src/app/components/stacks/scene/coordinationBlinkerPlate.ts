import type { BlinkerSpot } from "./coordinationCrossing";
import { BLINKER_EM } from "./coordinationDust";

/** Where the WebGL blinker is drawn, written to the DOM plates that carry its
 * HDR fill. The canvas cannot show HDR in Safari, so a video has to sit over it,
 * and each frame's place and blink come from the same numbers the shader got.
 *
 * Free of Three and of React, because the frame loop writes here on every
 * frame: no render, and with no plate attached no DOM work either. */
const plates = new Set<HTMLElement>();

const place = (plate: HTMLElement, spot: BlinkerSpot, block: number) => {
  const width = spot.em * BLINKER_EM.width;
  const height = spot.em * BLINKER_EM.height;
  plate.style.width = `${width}px`;
  plate.style.height = `${height}px`;
  plate.style.transform = `translate3d(${spot.x - width / 2}px, ${spot.y - height / 2}px, 0)`;
  plate.style.opacity = `${block}`;
  // Inherit, never visible, so a hidden canvas takes its plate with it.
  plate.style.visibility = "inherit";
};

export const blinkerPlate = {
  attach(plate: HTMLElement) {
    plates.add(plate);
    return () => {
      plates.delete(plate);
    };
  },
  /** `block` is the block's opacity, its blink, on the shader's own clock. */
  place(spot: BlinkerSpot, block: number) {
    for (const plate of plates) place(plate, spot, block);
  },
  /** A plate that has nothing to cover must not be painted: a video under
   * opacity 0 still holds the screen in HDR mode. */
  hide() {
    for (const plate of plates) plate.style.visibility = "hidden";
  },
};
