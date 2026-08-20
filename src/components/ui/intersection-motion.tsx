"use client";

import {
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";

function thresholdFor(element: HTMLElement) {
  if (element.classList.contains("intersect-full")) return 0.99;
  if (element.classList.contains("intersect-half")) return 0.5;
  return 0;
}

/**
 * Starts observing only after React has hydrated the element that owns the
 * ref. A document-wide scan can mutate a streamed sibling before React gets
 * to it, which turns the observer's `no-intersect` marker into a hydration
 * mismatch on slower clients.
 */
export function useIntersectionMotion<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled = true,
) {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            element.setAttribute("no-intersect", "");
            continue;
          }

          element.removeAttribute("no-intersect");
          if (element.classList.contains("intersect-once")) {
            observer.disconnect();
          }
        }
      },
      { threshold: thresholdFor(element) },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, ref]);
}

export function IntersectionMotion({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useIntersectionMotion(ref);

  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  );
}
