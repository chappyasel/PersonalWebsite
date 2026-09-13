"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  XIcon,
} from "@phosphor-icons/react";

import { Button } from "~/components/ui/button";

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
  layout?: "scene" | "document";
  actions?: ImageViewerAction[];
  total: number;
  index: number;
  visible: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
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

      <div
        data-artifact-preview-scrim
        className="absolute inset-x-0 bottom-0 px-[max(16px,env(safe-area-inset-left))] pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5"
      >
        <div
          className={
            layout === "document"
              ? "mx-auto flex max-w-2xl flex-col items-center gap-3"
              : "mx-auto flex max-w-[1500px] flex-col gap-2 sm:flex-row sm:items-center"
          }
        >
          {total > 1 && (
            <div
              data-artifact-preview-control="navigation"
              className={`pointer-events-auto order-2 flex self-center rounded-full ${glassControl} ${layout === "scene" ? "sm:order-none sm:self-auto" : ""}`}
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

          {caption?.trim() && (
            <section
              id={captionId}
              data-artifact-preview-caption
              className={
                layout === "document"
                  ? "order-0 min-w-0 max-w-2xl px-4 text-center"
                  : "order-0 min-w-0 max-w-2xl self-center rounded-xl bg-black/55 px-3 py-2 text-center shadow-lg backdrop-blur-sm sm:flex-1 sm:self-auto sm:text-left"
              }
            >
              {title && (
                <h2 className="font-serif text-lg leading-tight text-white sm:text-xl">
                  {title}
                </h2>
              )}
              <p
                className={`${title ? "mt-1" : ""} text-pretty text-[13px] leading-relaxed text-white/85 sm:text-sm`}
              >
                {caption}
              </p>
            </section>
          )}

          {actions.length > 0 && (
            <div
              data-artifact-preview-control="actions"
              className="pointer-events-auto order-1 flex w-fit max-w-full items-center justify-center gap-2 self-center sm:order-none sm:ml-auto sm:self-auto"
            >
              {actions.map((action) => {
                return (
                  <a
                    key={`${action.href}:${action.label}`}
                    href={action.href}
                    target={action.external ? "_blank" : undefined}
                    rel={action.external ? "noreferrer" : undefined}
                    className={`inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-5 text-center text-sm font-medium sm:min-h-10 ${glassControl}`}
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
        </div>
      </div>
    </div>
  );
}
