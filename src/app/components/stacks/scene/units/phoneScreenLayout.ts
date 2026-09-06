// The phone's display, in the iPhone 15's own proportions.
//
// The screenshot is a raw capture (1179 × 2556, the 393 × 852 pt grid at 3x),
// which carries the status bar but not the Dynamic Island: the island is a
// hole in the panel, so a screenshot never shows it. Putting the picture on a
// screen means painting the island back in, at the size and place the panel
// has it, and clipping the corners the way the glass does. Everything below
// is in points of that grid, scaled to whatever texture width the scene asks
// for, so the geometry cannot drift from the device it describes.

export const IPHONE_15_SCREEN = {
  widthPt: 393,
  heightPt: 852,
  /** Display corner radius. */
  cornerPt: 55,
  /** The Dynamic Island: a centred pill with fully round ends, its top edge
   * 11 pt below the top of the panel. */
  island: { widthPt: 126, heightPt: 37, topPt: 11 },
} as const;

/** Held up, the phone fills a good third of a retina viewport; 512 read as
 * soft there ("too low res"). 1024 is the 393 pt grid at 2.6x. */
export const PHONE_SCREEN_TEXTURE_WIDTH = 1024;

export type PhoneScreenLayout = {
  width: number;
  height: number;
  corner: number;
  island: { x: number; y: number; width: number; height: number };
};

export function phoneScreenLayout(
  width = PHONE_SCREEN_TEXTURE_WIDTH,
  device = IPHONE_15_SCREEN,
): PhoneScreenLayout {
  const scale = width / device.widthPt;
  return {
    width,
    height: Math.round(device.heightPt * scale),
    corner: device.cornerPt * scale,
    island: {
      x: ((device.widthPt - device.island.widthPt) / 2) * scale,
      y: device.island.topPt * scale,
      width: device.island.widthPt * scale,
      height: device.island.heightPt * scale,
    },
  };
}

/** Display aspect, height over width, for the quad the texture lands on. */
export const PHONE_SCREEN_ASPECT =
  IPHONE_15_SCREEN.heightPt / IPHONE_15_SCREEN.widthPt;

export type PhoneScreenPainter = Pick<
  CanvasRenderingContext2D,
  | "clearRect"
  | "save"
  | "restore"
  | "beginPath"
  | "roundRect"
  | "clip"
  | "fill"
  | "drawImage"
> & { fillStyle: CanvasRenderingContext2D["fillStyle"] };

/** The picture clipped to the panel's corners, the island painted over it.
 * Without a picture the panel is simply off: black glass, same corners. */
export function paintPhoneScreen(
  ctx: PhoneScreenPainter,
  image: CanvasImageSource | null,
  layout: PhoneScreenLayout,
) {
  const { width, height, corner, island } = layout;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, corner);
  ctx.clip();
  if (image) ctx.drawImage(image, 0, 0, width, height);
  else {
    ctx.fillStyle = "#000000";
    ctx.fill();
  }
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.roundRect(
    island.x,
    island.y,
    island.width,
    island.height,
    island.height / 2,
  );
  ctx.fill();
  ctx.restore();
}
