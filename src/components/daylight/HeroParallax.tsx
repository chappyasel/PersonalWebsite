"use client";

import { useEffect, useRef } from "react";

/**
 * Drives the hero's depth: writes --dl-plxy (the scroll offset in px, clamped
 * to the hero's own height) onto the nearest .dl-hero, and daylight.css
 * translates each sky layer at its own depth from that one number. A rAF loop
 * instead of CSS scroll timelines because iOS drops those silently. Inside
 * the intercepted sheet the page scrolls in a container, not the window, so
 * the driver reads whichever of the two actually moves.
 */
export default function HeroParallax() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const hero = ref.current?.closest<HTMLElement>(".dl-hero");
    if (!hero) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scroller = hero.closest<HTMLElement>("[data-modal-scroller]");
    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = scroller ? scroller.scrollTop : window.scrollY;
      const clamped = Math.min(Math.max(y, 0), hero.offsetHeight);
      hero.style.setProperty("--dl-plxy", `${clamped}px`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <span ref={ref} hidden />;
}
