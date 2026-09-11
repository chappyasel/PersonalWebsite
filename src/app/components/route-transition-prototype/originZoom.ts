export type OriginRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function originZoomGeometry(
  source: OriginRect | null | undefined,
  width: number,
  height: number,
) {
  const valid =
    source &&
    [source.left, source.top, source.width, source.height].every(
      Number.isFinite,
    ) &&
    source.width > 0 &&
    source.height > 0;
  const left = valid ? Math.max(0, source.left) : width / 2 - 80;
  const top = valid ? Math.max(0, source.top) : height / 2 - 60;
  const right = valid
    ? Math.min(width, source.left + source.width)
    : left + 160;
  const bottom = valid
    ? Math.min(height, source.top + source.height)
    : top + 120;
  if (right <= left || bottom <= top)
    return originZoomGeometry(null, width, height);
  const rect = { left, top, width: right - left, height: bottom - top };
  // The outgoing screen is a bitmap. Keep its push small, even for tiny links;
  // an expanding clip reveals the destination at its native size instead.
  const scale = Math.min(
    1.2,
    Math.max(width / rect.width, height / rect.height),
  );
  const x = -(rect.left + rect.width / 2) * (scale - 1);
  const y = -(rect.top + rect.height / 2) * (scale - 1);
  return {
    rect,
    zoom: `translate(${x}px, ${y}px) scale(${scale})`,
    clip: `inset(${top}px ${width - right}px ${height - bottom}px ${left}px round ${Math.min(16, rect.width / 2, rect.height / 2)}px)`,
    panel: `translate(${left}px, ${top}px) scale(${rect.width / width}, ${rect.height / height})`,
  };
}

// Browsers without screen snapshots still expand from the real source box.
// Only the panel is synthetic; navigation and its URL stay exactly the same.
export async function playOriginPanel(
  element: HTMLElement,
  from: string,
  commit: () => Promise<void>,
  signal: AbortSignal,
  speed: number,
) {
  const animations: Animation[] = [];
  async function animate(frames: Keyframe[], duration: number) {
    signal.throwIfAborted();
    const animation = element.animate(frames, {
      duration,
      easing: "cubic-bezier(.22,1,.36,1)",
      fill: "forwards",
    });
    animations.push(animation);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error("Source zoom timed out")),
        duration + 500,
      );
      const abort = () => finish(new DOMException("Cancelled", "AbortError"));
      function finish(error?: unknown) {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        if (error)
          reject(
            error instanceof Error
              ? error
              : new Error("Source zoom interrupted", { cause: error }),
          );
        else resolve();
      }
      signal.addEventListener("abort", abort, { once: true });
      void animation.finished.then(
        () => finish(),
        (error: unknown) => finish(error),
      );
    });
  }
  try {
    await animate(
      [
        { transform: from, borderRadius: "24px", opacity: 1 },
        { transform: "none", borderRadius: "0px", opacity: 1 },
      ],
      520 * speed,
    );
    signal.throwIfAborted();
    await commit();
    signal.throwIfAborted();
    await animate([{ opacity: 1 }, { opacity: 0 }], 180 * speed);
  } finally {
    animations.forEach((animation) => animation.cancel());
  }
}
