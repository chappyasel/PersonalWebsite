"use client";

import {
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PhotoSlider } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";

import { Button } from "~/components/ui/button";

import { ImageViewerChrome } from "./ImageViewerChrome";
import { fitImagePreview } from "./imagePreviewFit";
import { artifactPreviewVisualEffects } from "~/app/components/stacks/scene/artifactPreviewVisualEffects";

type GalleryImage = {
  id: string;
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  originRef: RefObject<HTMLButtonElement | null>;
};
const GalleryContext = createContext<{
  register: (image: GalleryImage) => () => void;
  open: (id: string, element: HTMLButtonElement) => void;
} | null>(null);

/** Uses the homepage controls and PhotoSlider engine without loading the scene. */
export function DocumentGallery({ children }: { children: ReactNode }) {
  const visualEffects = useSyncExternalStore(
    artifactPreviewVisualEffects.subscribe,
    artifactPreviewVisualEffects.getSnapshot,
    () => artifactPreviewVisualEffects.defaultSnapshot,
  );
  const [entries, setEntries] = useState<GalleryImage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const trigger = useRef<HTMLButtonElement | null>(null);
  const register = useCallback((image: GalleryImage) => {
    setEntries((previous) => [
      ...previous.filter((entry) => entry.id !== image.id),
      image,
    ]);
    return () =>
      setEntries((previous) =>
        previous.filter((entry) => entry.id !== image.id),
      );
  }, []);
  const open = useCallback((id: string, element: HTMLButtonElement) => {
    trigger.current = element;
    setSelected(id);
    setViewport({ width: innerWidth, height: innerHeight });
    setVisible(true);
  }, []);
  const context = useMemo(() => ({ register, open }), [register, open]);
  const index = Math.max(
    0,
    entries.findIndex((entry) => entry.id === selected),
  );
  const active = entries[index];
  useEffect(() => {
    if (!visible) return;
    const resize = () =>
      setViewport({ width: innerWidth, height: innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [visible]);
  const images = entries.map((entry) => {
    const thumbnail = entry.originRef.current?.querySelector("img");
    const sourceWidth = entry.width ?? thumbnail?.naturalWidth ?? 0;
    const sourceHeight = entry.height ?? thumbnail?.naturalHeight ?? 0;
    const size = fitImagePreview(
      {
        width: sourceWidth > 0 ? sourceWidth : 800,
        height: sourceHeight > 0 ? sourceHeight : 600,
      },
      viewport,
      { upscale: true, verticalInset: entry.caption ? 130 : 80 },
    );
    return {
      key: entry.id,
      originRef: entry.originRef,
      width: size.width,
      height: size.height,
      render: ({ attrs }: { attrs: Partial<HTMLAttributes<HTMLElement>> }) => (
        // The viewer supplies the animated geometry and drag handlers.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...(attrs as HTMLAttributes<HTMLImageElement>)}
          src={entry.src}
          alt={entry.alt}
          draggable={false}
          className={`PhotoView__Photo ${attrs.className ?? ""}`}
          style={{ ...attrs.style, objectFit: "contain" }}
        />
      ),
    };
  });
  return (
    <GalleryContext.Provider value={context}>
      {children}
      <PhotoSlider
        images={images}
        index={index}
        visible={visible && !!active}
        onIndexChange={(next) => {
          if (entries[next]) setSelected(entries[next].id);
        }}
        onClose={() => setVisible(false)}
        afterClose={() => {
          trigger.current?.focus({ preventScroll: true });
          setSelected(null);
        }}
        loop={false}
        bannerVisible={false}
        maskOpacity={null}
        photoClosable={false}
        className="stacks-artifact-preview"
        maskClassName={`document-gallery-mask${visualEffects.backdropBlur ? " document-gallery-mask--blurred" : ""}`}
        speed={(phase) =>
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : phase === 3
              ? 520
              : 420
        }
        easing={() => "cubic-bezier(0.4, 0, 0.2, 1)"}
        overlayRender={(props) =>
          active ? (
            <ImageViewerChrome
              layout="document"
              caption={active.caption}
              total={entries.length}
              index={props.index}
              visible={props.visible}
              onIndexChange={props.onIndexChange}
              onClose={props.onClose}
            />
          ) : null
        }
      />
    </GalleryContext.Provider>
  );
}

export function ZoomableImage({
  src,
  alt,
  caption,
  width,
  height,
  children,
  className,
}: {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  const gallery = useContext(GalleryContext);
  if (!gallery)
    return (
      <DocumentGallery>
        <ZoomableImage
          src={src}
          alt={alt}
          caption={caption}
          width={width}
          height={height}
          className={className}
        >
          {children}
        </ZoomableImage>
      </DocumentGallery>
    );
  return (
    <RegisteredImage
      {...{ src, alt, caption, width, height, children, className }}
    />
  );
}

function RegisteredImage({
  src,
  alt,
  caption,
  width,
  height,
  children,
  className,
}: Parameters<typeof ZoomableImage>[0]) {
  const gallery = useContext(GalleryContext)!;
  const id = useId();
  const originRef = useRef<HTMLButtonElement>(null);
  useEffect(
    () => gallery.register({ id, src, alt, caption, width, height, originRef }),
    [gallery, id, src, alt, caption, width, height],
  );
  return (
    <Button
      ref={originRef}
      type="button"
      variant="ghost"
      aria-label={alt ? `Enlarge image: ${alt}` : "Enlarge image"}
      data-document-image
      className={`block h-auto max-w-full cursor-zoom-in whitespace-normal rounded-lg p-0 hover:bg-transparent focus-visible:ring-2 ${className ?? ""}`}
      onClick={(event) => gallery.open(id, event.currentTarget)}
    >
      {children}
    </Button>
  );
}
