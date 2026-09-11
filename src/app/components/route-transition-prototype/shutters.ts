// One shutter pass for the local navigation prototype. Navigation owns the
// covered interval; animation never adds a minimum loading-screen dwell.
export const SHUTTER_TIMING = { close: 240, open: 320 } as const;

export async function playShutters({
  panels,
  commit,
  signal,
  speed,
  onPhase,
}: {
  panels: HTMLElement[];
  commit: () => Promise<void>;
  signal: AbortSignal;
  speed: number;
  onPhase: (phase: "covered" | "opening") => void;
}) {
  const animations: Animation[] = [];
  async function move(open: boolean) {
    signal.throwIfAborted();
    const duration =
      (open ? SHUTTER_TIMING.open : SHUTTER_TIMING.close) * speed;
    const pass = panels.map((panel) => {
      const outside = panel.dataset.panel === "left" ? "-100%" : "100%";
      const positions = open ? ["0", outside] : [outside, "0"];
      const animation = panel.animate(
        positions.map((x) => ({ transform: `translateX(${x})` })),
        { duration, easing: "cubic-bezier(.76,0,.24,1)", fill: "forwards" },
      );
      animations.push(animation);
      return animation;
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        finish(new Error("Shutter animation timed out"));
      }, duration + 500);
      const abort = () =>
        finish(new DOMException("Transition cancelled", "AbortError"));
      function finish(error?: unknown) {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        if (error)
          reject(
            error instanceof Error
              ? error
              : new Error("Shutter animation interrupted", { cause: error }),
          );
        else resolve();
      }
      signal.addEventListener("abort", abort, { once: true });
      void Promise.all(pass.map((animation) => animation.finished)).then(
        () => finish(),
        (error: unknown) => finish(error),
      );
    });
    signal.throwIfAborted();
  }
  try {
    if (panels.length !== 2) throw new Error("Shutter panels unavailable");
    await move(false);
    onPhase("covered");
    await commit();
    signal.throwIfAborted();
    onPhase("opening");
    await move(true);
  } finally {
    for (const animation of animations) animation.cancel();
  }
}
