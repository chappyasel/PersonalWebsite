async function decodeDetails(svg: Element) {
  await Promise.all(
    [...svg.querySelectorAll("image")].map((node) => {
      const image = new Image();
      image.src =
        node.getAttribute("href") ?? node.getAttribute("xlink:href") ?? "";
      return image.decode();
    }),
  );
}

/** Borrow the approved drawing for assembly; its settled image stays the
 * registration target. No second set of prop positions or silhouettes. */
export async function prepareEntranceArtwork(
  stage: HTMLElement,
  signal: AbortSignal,
) {
  const about = stage.querySelector<SVGSVGElement>("svg.stacks-boot-scene");
  if (about) {
    await decodeDetails(about);
    signal.throwIfAborted();
    const items = [
      ...about.querySelectorAll<SVGGElement>(
        ".stacks-boot-landmarks .stacks-boot-item-motion",
      ),
    ].sort(
      (a, b) =>
        Number(a.parentElement?.dataset.cadenceSlot) -
        Number(b.parentElement?.dataset.cadenceSlot),
    );
    return { items, dispose: () => undefined };
  }
  const image = stage.querySelector<HTMLImageElement>(
    "img[data-illustration-image]",
  );
  if (!image) throw new Error("No selected entrance artwork");
  await image.decode();
  signal.throwIfAborted();
  const response = await fetch(image.currentSrc || image.src, {
    signal,
    cache: "force-cache",
  });
  if (!response.ok) throw new Error("Entrance artwork did not load");
  const parsed = new DOMParser().parseFromString(
    await response.text(),
    "image/svg+xml",
  );
  signal.throwIfAborted();
  const svg = parsed.documentElement;
  // Same-origin generated assets reject active content at build time. A
  // failed HTML response must not become an inline scene.
  if (
    svg.localName !== "svg" ||
    svg.querySelector("parsererror, script, foreignObject") ||
    !svg.querySelector(':scope > g[data-part="shelf"]')
  )
    throw new Error("Invalid entrance artwork");
  // An SVG image and inline SVG are different resource trees. Decode the
  // latter's embedded covers/photos before their reveal clocks start.
  await decodeDetails(svg);
  signal.throwIfAborted();
  const overlay = document.createElement("div");
  overlay.className = "room-entrance-artwork";
  overlay.setAttribute("aria-hidden", "true");
  overlay.append(document.importNode(svg, true));
  const items = [
    ...overlay.querySelectorAll<SVGGElement>(
      "svg > g[data-part]:not([data-part='shelf'])",
    ),
  ];
  items.forEach((item) => item.classList.add("room-entrance-item"));
  stage.append(overlay);
  stage.dataset.entranceArtwork = "";
  return {
    items,
    dispose: () => {
      overlay.remove();
      delete stage.dataset.entranceArtwork;
    },
  };
}

export function waitForEntranceStage(root: HTMLElement, signal: AbortSignal) {
  return new Promise<HTMLElement>((resolve, reject) => {
    let frame = 0;
    const abort = () => {
      cancelAnimationFrame(frame);
      reject(new DOMException("Entrance cancelled", "AbortError"));
    };
    const inspect = () => {
      const stage = root.querySelector<HTMLElement>(
        "[data-illustration-positioned] [data-illustration-selected] .room-illustration-stage",
      );
      if (stage) {
        signal.removeEventListener("abort", abort);
        resolve(stage);
      } else frame = requestAnimationFrame(inspect);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else inspect();
  });
}
