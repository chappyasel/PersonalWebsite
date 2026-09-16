"use client";

import { useMotionValue, useTransform } from "framer-motion";
import { type RefObject, useLayoutEffect } from "react";

// Preserve room for the first card's lift and shadow at rest.
export const MOBILE_CARD_BLEED_PX = 24;
export const MOBILE_SCROLL_FADE_PX = 72;

export function useMobileSheetScrollFade(
  ref: RefObject<HTMLDivElement | null>,
  attached: boolean,
) {
  const progress = useMotionValue(0);
  const mask = useTransform(progress, (strength) => {
    // The clipping edge must always be transparent. Animating its opacity
    // exposes a straight cut whenever content reaches it before the fade is
    // fully engaged. Grow the fade's depth instead: at rest it fits inside
    // the padding, then extends into the content as the reader scrolls.
    const depth =
      MOBILE_CARD_BLEED_PX +
      strength * (MOBILE_SCROLL_FADE_PX - MOBILE_CARD_BLEED_PX);
    const stops = [
      [0, 0],
      [12, 0.05],
      [24, 0.25],
      [40, 0.55],
      [56, 0.85],
      [MOBILE_SCROLL_FADE_PX, 1],
    ] as const;
    return `linear-gradient(to bottom, ${stops
      .map(
        ([px, alpha]) =>
          `rgb(0 0 0 / ${alpha}) ${(px / MOBILE_SCROLL_FADE_PX) * depth}px`,
      )
      .join(", ")})`;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !attached) {
      progress.set(0);
      return;
    }
    const update = () => {
      const distance = Math.min(
        Math.max(0, el.scrollTop),
        Math.max(0, el.scrollHeight - el.clientHeight),
      );
      const t = Math.min(1, distance / MOBILE_SCROLL_FADE_PX);
      progress.set(t * t * (3 - 2 * t));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    const observeChildren = () => {
      resize.disconnect();
      resize.observe(el);
      for (const child of el.children) resize.observe(child);
      update();
    };
    observeChildren();
    const mutations = new MutationObserver(observeChildren);
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [attached, progress, ref]);

  return { progress, mask };
}
