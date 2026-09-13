"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLayoutEffect, useRef } from "react";

import { Button } from "~/components/ui/button";

import {
  ARTIFACT_PREVIEW_DURATION_MS,
  ARTIFACT_PREVIEW_EASING,
} from "~/app/components/stacks/modal/artifactPreviewMotion";

const glassControl =
  "world-glass-control border transition-[background-color,border-color,color,transform] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none";

export type ImageViewerAction = {
  href: string;
  label: string;
  external?: boolean;
};

/** Shared by the homepage artifact inspector and document image galleries. */
export function ImageViewerChrome({
  title,
  caption,
  captionId,
  contentTop,
  captionMaxHeight,
  onMeasure,
  layout = "scene",
  actions = [],
  total,
  index,
  visible,
  onIndexChange,
  onClose,
}: {
  title?: string;
  caption?: string;
  captionId?: string;
  /** Viewport position just below the displayed image. When given, the
   * caption sits there and is measured for the owner; otherwise it joins
   * the bottom dock. */
  contentTop?: number;
  /** Visible cap for the caption; taller captions scroll. */
  captionMaxHeight?: number;
  onMeasure?: (measurement: {
    captionHeight: number;
    controlsHeight: number;
  }) => void;
  layout?: "scene" | "document";
  actions?: ImageViewerAction[];
  total: number;
  index: number;
  visible: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const captionRefs = useRef(new Map<string, HTMLElement>());
  const captionKey = captionId ?? caption ?? "";
  const controlsRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    if (!onMeasure) return;
    const measure = () =>
      onMeasure({
        captionHeight: captionRefs.current.get(captionKey)?.offsetHeight ?? 0,
        controlsHeight: controlsRef.current?.offsetHeight ?? 0,
      });
    measure();
    const observer = new ResizeObserver(measure);
    const captionElement = captionRefs.current.get(captionKey);
    if (captionElement) observer.observe(captionElement);
    if (controlsRef.current) observer.observe(controlsRef.current);
    return () => observer.disconnect();
  }, [caption, captionKey, onMeasure]);

  const captionContent = caption?.trim() ? (
    <section
      ref={(element) => {
        if (element) captionRefs.current.set(captionKey, element);
        else captionRefs.current.delete(captionKey);
      }}
      id={captionId}
      data-artifact-preview-caption
      className={
        layout === "document"
          ? "order-0 min-w-0 max-w-2xl px-4 text-center"
          : "order-0 min-w-0 max-w-2xl self-center rounded-xl bg-black/55 px-3 py-2 text-center shadow-lg backdrop-blur-sm"
      }
    >
      <p className="text-pretty text-[13px] leading-relaxed text-white/85 sm:text-sm">
        {caption}
      </p>
    </section>
  ) : null;

  return (
    <div
      data-scene-artifact-inspector
      data-preview-chrome-visible={visible ? "" : undefined}
      className="pointer-events-none fixed inset-0 z-[30] text-white"
    >
      <Button
        variant="ghost"
        type="button"
        onClick={onClose}
        aria-label={title ? `Close ${title} preview` : "Close image preview"}
        data-artifact-preview-control="close"
        className={`pointer-events-auto absolute right-[max(14px,env(safe-area-inset-right))] top-[max(14px,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full p-0 sm:size-10 ${glassControl}`}
      >
        <XIcon aria-hidden size={21} weight="bold" />
      </Button>

      {contentTop !== undefined && (
        <div
          className="absolute inset-x-0 flex justify-center px-4"
          style={{
            top: contentTop,
            // The image re-fits on the viewer's clock when the caption
            // changes; the caption follows on the same one.
            transition: reducedMotion
              ? "none"
              : `top ${ARTIFACT_PREVIEW_DURATION_MS}ms ${ARTIFACT_PREVIEW_EASING}`,
          }}
        >
          <AnimatePresence mode="popLayout">
            {captionContent && (
              <motion.div
                key={captionKey}
                className="pointer-events-auto max-w-2xl overflow-y-auto overscroll-contain"
                initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
                animate={{
                  opacity: visible ? 1 : 0,
                  y: visible || reducedMotion ? 0 : 8,
                }}
                exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }}
                transition={{ duration: reducedMotion ? 0 : 0.24 }}
                aria-hidden={!visible}
                inert={!visible}
                style={{ maxHeight: captionMaxHeight, touchAction: "pan-y" }}
                // react-photo-view cancels every touchmove at the window
                // (non-passive, preventDefault) to own the drag. A scroll
                // inside the caption must not reach it, or a long caption
                // cannot be scrolled on a phone.
                onTouchMove={(event) => event.stopPropagation()}
              >
                {captionContent}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div
        ref={controlsRef}
        data-artifact-preview-scrim
        className="absolute inset-x-0 bottom-0 px-[max(16px,env(safe-area-inset-left))] pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5"
      >
        <div
          className={
            layout === "document"
              ? "mx-auto flex max-w-2xl flex-col items-center gap-3"
              : "mx-auto flex max-w-2xl flex-col items-center gap-2"
          }
        >
          {actions.length > 0 && (
            <div
              data-artifact-preview-control="actions"
              className="pointer-events-auto order-1 flex w-fit max-w-full flex-wrap items-center justify-center gap-2 self-center"
            >
              {actions.map((action) => {
                return (
                  <a
                    key={`${action.href}:${action.label}`}
                    href={action.href}
                    target={action.external ? "_blank" : undefined}
                    rel={action.external ? "noreferrer" : undefined}
                    className={`inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 whitespace-normal rounded-full px-5 text-center text-sm font-medium sm:min-h-10 ${glassControl}`}
                  >
                    {action.label}
                    {action.external && (
                      <ArrowUpRightIcon aria-hidden size={15} weight="bold" />
                    )}
                  </a>
                );
              })}
            </div>
          )}

          {total > 1 && (
            <div
              data-artifact-preview-control="navigation"
              className={`pointer-events-auto order-2 flex self-center rounded-full ${glassControl}`}
            >
              <Button
                variant="ghost"
                type="button"
                onClick={() => onIndexChange(index - 1)}
                disabled={index === 0}
                aria-label="Previous image"
                className="grid size-11 place-items-center rounded-l-full p-0 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 motion-reduce:transition-none sm:size-10"
              >
                <ArrowLeftIcon aria-hidden size={18} weight="bold" />
              </Button>
              <span
                aria-live="polite"
                className="grid min-w-14 place-items-center border-x border-white/10 px-2 font-mono text-[11px] tracking-[0.08em] text-white/70"
              >
                {index + 1} / {total}
              </span>
              <Button
                variant="ghost"
                type="button"
                onClick={() => onIndexChange(index + 1)}
                disabled={index === total - 1}
                aria-label="Next image"
                className="grid size-11 place-items-center rounded-r-full p-0 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 motion-reduce:transition-none sm:size-10"
              >
                <ArrowRightIcon aria-hidden size={18} weight="bold" />
              </Button>
            </div>
          )}

          {contentTop === undefined && captionContent}
        </div>
      </div>
    </div>
  );
}
