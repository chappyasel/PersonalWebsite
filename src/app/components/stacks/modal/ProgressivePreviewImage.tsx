"use client";

import {
  type CSSProperties,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ARTIFACT_PREVIEW_DETAIL_IN_START,
  ARTIFACT_PREVIEW_DETAIL_OUT_START,
  ARTIFACT_PREVIEW_DURATION_MS,
} from "./artifactPreviewMotion";

type ProgressivePreviewImageProps = Readonly<{
  previewSrc: string;
  detailSrc: string;
  className: string;
  style: CSSProperties;
  opening?: boolean;
  dismissing?: boolean;
}>;

/**
 * Keeps the scene-sized image painted while the fullscreen master decodes.
 * The master fades over the opaque preview, so network and decode timing can
 * never decide when the geometry morph appears to finish.
 */
export function ProgressivePreviewImage({
  previewSrc,
  detailSrc,
  className,
  style,
  opening = false,
  dismissing = false,
}: ProgressivePreviewImageProps) {
  const detailImage = useRef<HTMLImageElement>(null);
  const [decodedSrc, setDecodedSrc] = useState<string | null>(null);
  const [detailAllowed, setDetailAllowed] = useState(!opening);
  const hasDistinctDetail = previewSrc !== detailSrc;
  const detailDecoded = decodedSrc === detailSrc;
  const detailVisible = detailDecoded && detailAllowed;

  useEffect(() => {
    if (!hasDistinctDetail) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (opening) {
      setDetailAllowed(false);
      timer = setTimeout(
        () => setDetailAllowed(true),
        ARTIFACT_PREVIEW_DURATION_MS * ARTIFACT_PREVIEW_DETAIL_IN_START,
      );
    } else if (dismissing) {
      timer = setTimeout(
        () => setDetailAllowed(false),
        ARTIFACT_PREVIEW_DURATION_MS * ARTIFACT_PREVIEW_DETAIL_OUT_START,
      );
    } else {
      setDetailAllowed(true);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [detailSrc, dismissing, hasDistinctDetail, opening]);

  const revealDecodedDetail = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget;
      const reveal = () => {
        if (detailImage.current === image) setDecodedSrc(detailSrc);
      };
      if (typeof image.decode !== "function") {
        reveal();
        return;
      }
      void image
        .decode()
        .then(reveal)
        .catch(() => {
          // The scene-sized image remains visible if the master cannot decode.
        });
    },
    [detailSrc],
  );

  return (
    <>
      {/* The scene already requested this URL, making it the durable first
          frame while the larger file starts loading. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewSrc}
        alt=""
        draggable={false}
        loading="eager"
        decoding="sync"
        className={className}
        style={style}
        data-scene-artifact-preview-photo
        data-scene-artifact-preview-photo-base
      />
      {hasDistinctDetail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={detailImage}
          src={detailSrc}
          alt=""
          draggable={false}
          loading="eager"
          decoding="async"
          onLoad={revealDecodedDetail}
          className={`${className} stacks-artifact-preview-detail`}
          style={style}
          data-scene-artifact-preview-photo
          data-scene-artifact-preview-photo-detail
          data-scene-artifact-preview-photo-decoded={
            detailDecoded ? "" : undefined
          }
          data-scene-artifact-preview-photo-detail-visible={
            detailVisible ? "" : undefined
          }
        />
      )}
    </>
  );
}
