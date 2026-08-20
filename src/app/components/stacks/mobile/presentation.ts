export type PresentationProfile = "portrait" | "wide" | "short-landscape";

/** Presentation follows viewport geometry only. Input type is deliberately
 * absent: a narrow mouse window and a narrow touchscreen share composition. */
export function presentationProfileForViewport(
  width: number,
  height: number,
): PresentationProfile {
  const safeHeight = Math.max(1, height);
  const aspect = width / safeHeight;
  if (width < 1200 && aspect <= 0.75) return "portrait";
  if (width < 1200 && aspect > 1 && height < 600) return "short-landscape";
  return "wide";
}

export function interactionProfileForPointer(
  pointerType: string,
): "coarse" | "fine" {
  return pointerType === "touch" ? "coarse" : "fine";
}
