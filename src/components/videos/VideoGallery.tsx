"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  type ReactNode,
  createContext,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { OVERLAY_MOTION_STYLE } from "~/lib/overlays/motion";

import { ImageViewerChrome } from "~/components/images/ImageViewerChrome";
import { OverlayPresence } from "~/components/overlays/OverlayPresence";
import { Button } from "~/components/ui/button";

import styles from "./VideoGallery.module.css";
import { artifactPreviewVisualEffects } from "~/app/components/stacks/scene/artifactPreviewVisualEffects";

type Video = {
  id: string;
  title: string;
};

const VideoContext = createContext<
  ((id: string, trigger: HTMLButtonElement) => void) | null
>(null);

/** Mount only the selected player; Radix retains it through the brief exit. */
export function VideoGallery({
  videos,
  children,
}: {
  videos: Video[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const dismissArmed = useRef(false);
  const index = videos.findIndex((video) => video.id === selected);
  const active = videos[index];
  const effects = useSyncExternalStore(
    artifactPreviewVisualEffects.subscribe,
    artifactPreviewVisualEffects.getSnapshot,
    () => artifactPreviewVisualEffects.defaultSnapshot,
  );

  return (
    <VideoContext.Provider
      value={(id, element) => {
        trigger.current = element;
        setSelected(id);
        setOpen(true);
      }}
    >
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        {active && (
          <Dialog.Portal>
            <Dialog.Overlay
              data-overlay-backdrop=""
              style={OVERLAY_MOTION_STYLE}
              className={`document-gallery-mask fixed inset-0 z-[6000] ${effects.backdropBlur ? "document-gallery-mask--blurred" : ""} ${styles.backdrop}`}
            />
            <Dialog.Content
              data-overlay-surface=""
              style={OVERLAY_MOTION_STYLE}
              aria-modal="true"
              aria-describedby={undefined}
              data-stacks-scrollable=""
              className={`fixed inset-0 z-[6001] flex flex-col items-center justify-center text-white outline-none ${styles.viewer}`}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                trigger.current?.focus({ preventScroll: true });
              }}
              onPointerDown={(event) => {
                dismissArmed.current = event.target === event.currentTarget;
              }}
              onPointerCancel={() => {
                dismissArmed.current = false;
              }}
              onClick={(event) => {
                if (
                  event.target === event.currentTarget &&
                  dismissArmed.current
                )
                  setOpen(false);
                dismissArmed.current = false;
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <OverlayPresence
                kind="video"
                phase={open ? "open" : "closing"}
                onDismiss={() => setOpen(false)}
              />
              <Dialog.Title className="sr-only">{active.title}</Dialog.Title>
              <div className={styles.content}>
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/15 sm:rounded-2xl">
                  <iframe
                    key={active.id}
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(active.id)}?autoplay=1&playsinline=1&rel=0`}
                    // Iframes need a title to identify the embedded document.
                    // eslint-disable-next-line no-restricted-syntax
                    title={active.title}
                    className="absolute inset-0 size-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              </div>
              <ImageViewerChrome
                layout="document"
                mediaLabel="video"
                title={active.title}
                total={videos.length}
                index={index}
                visible
                onIndexChange={(next) => {
                  if (videos[next]) setSelected(videos[next].id);
                }}
                onClose={() => setOpen(false)}
              />
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </VideoContext.Provider>
  );
}

export function VideoTrigger({
  videoId,
  title,
  children,
  className,
}: {
  videoId: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const open = useContext(VideoContext);
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={`Play ${title}`}
      aria-haspopup="dialog"
      className={`h-auto items-stretch justify-start gap-0 whitespace-normal p-0 text-left font-normal hover:bg-transparent ${className ?? ""}`}
      onClick={(event) => open?.(videoId, event.currentTarget)}
    >
      {children}
    </Button>
  );
}
