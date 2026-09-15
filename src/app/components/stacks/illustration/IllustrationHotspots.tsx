"use client";

import { requestBookPrefetch } from "../bookPrefetch";
import type { StacksData } from "../data";
import { recordFieldNoteEvent } from "../fieldNotes/progress";
import { ABOUT_LANDMARK_ARTIFACTS } from "../scene/aboutBootComposition";
import type { AboutBootCamera } from "../scene/aboutBootPerspective";
import { openSceneArtifact } from "../sceneArtifactState";
import {
  type SceneArtifactId,
  sceneArtifactByArtworkId,
} from "../sceneArtifacts";
import { useStacks } from "../store";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useBookNotesActionLabel } from "~/lib/books/useBookNotesActionLabel";
import { recordModalOrigin } from "~/lib/originFlight";

import { openSheetRoute } from "~/components/modal-sheet/sheetRoute";

import { IllustrationObjectLabel } from "./IllustrationObjectLabel";
import {
  type RoomArtworkTheme,
  type RoomArtworkViewport,
  getRoomArtwork,
} from "./artwork";
import geometry from "./artwork/hotspots.generated.json";
import { illustrationInteraction } from "./illustrationInteraction";
import {
  type IllustrationLabel,
  illustrationLabel,
} from "./illustrationLabels";

/** A hotspot is either a labelled object or a silent print.
 *
 * A print carries no label on purpose: the live room gives its photos no
 * tooltip either, and an artifact's `title` is an internal name for the file
 * rather than anything a visitor should read. The inspector it opens shows
 * the caption, which is the text that was written to be read. */
type Target = {
  label: IllustrationLabel | null;
  artifact: SceneArtifactId | null;
  style: CSSProperties;
};
type CapturedGeometry = { parts: { id: string; box: number[] }[] };

export function IllustrationHotspots({
  unit,
  data,
  theme,
  viewport,
  camera,
}: {
  unit: number;
  data: StacksData;
  theme: RoomArtworkTheme;
  viewport: RoomArtworkViewport;
  camera?: AboutBootCamera;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const router = useRouter();
  const bookAction = useBookNotesActionLabel();
  const captured = (geometry as Record<string, CapturedGeometry>)[
    `${unit}/${theme}-${viewport}`
  ];
  const labels = useMemo(
    () =>
      (captured?.parts ?? []).flatMap<
        { id: string; box: number[] } & Pick<Target, "label" | "artifact">
      >((part) => {
        const label = illustrationLabel(unit, part.id, data, bookAction);
        if (label) return [{ ...part, label, artifact: null }];
        const artifact = sceneArtifactByArtworkId(part.id);
        return artifact
          ? [{ ...part, label: null, artifact: artifact.id }]
          : [];
      }),
    [captured, unit, data, bookAction],
  );

  useLayoutEffect(() => {
    const container = layer.current;
    const stage = container?.parentElement;
    if (!container || !stage) return;
    const measure = () => {
      const frame = container.getBoundingClientRect();
      if (!frame.width || !frame.height) return;
      const positioned = (
        of: Pick<Target, "label" | "artifact">,
        rect: { left: number; top: number; width: number; height: number },
      ): Target => ({
        label: of.label,
        artifact: of.artifact,
        style: {
          left: `${(100 * (rect.left - frame.left)) / frame.width}%`,
          top: `${(100 * (rect.top - frame.top)) / frame.height}%`,
          width: `${(100 * rect.width) / frame.width}%`,
          height: `${(100 * rect.height) / frame.height}%`,
        },
      });
      if (unit === 0) {
        const nodes = stage.querySelectorAll<SVGGraphicsElement>(
          "[data-landmark-id], [data-reading-book], [data-boot-role], [data-boot-ground-prop='dumbbell']",
        );
        setTargets(
          Array.from(nodes).flatMap((element) => {
            const id = element.dataset.readingBook
              ? `reading-book:${element.dataset.readingBook}`
              : element.dataset.bootRole
                ? `role:${element.dataset.bootRole}`
                : (element.dataset.landmarkId ?? "dumbbell");
            const label = illustrationLabel(unit, id, data, bookAction);
            // About's hotspots come from live SVG nodes, so its prints are
            // named by landmark ("profile-frame") rather than by the
            // grab-photo spelling the captured units use.
            const artifact = label
              ? null
              : ((ABOUT_LANDMARK_ARTIFACTS[id] ??
                  null) as SceneArtifactId | null);
            const rect = element.getBoundingClientRect();
            return (label || artifact) && rect.width > 0 && rect.height > 0
              ? [positioned({ label, artifact }, rect)]
              : [];
          }),
        );
      } else {
        const artwork = getRoomArtwork(unit, theme, viewport);
        const image = stage.querySelector<HTMLImageElement>(
          "img[data-illustration-image]",
        );
        if (!artwork || !image) return;
        const rect = image.getBoundingClientRect();
        const [x = 0, y = 0, width = 1, height = 1] = artwork.viewBox;
        const scale = Math.min(rect.width / width, rect.height / height);
        setTargets(
          labels.map(({ label, artifact, box }) =>
            positioned(
              { label, artifact },
              {
                left:
                  rect.left +
                  (rect.width - width * scale) / 2 +
                  (box[0]! - x) * scale,
                top:
                  rect.top +
                  (rect.height - height * scale) / 2 +
                  (box[1]! - y) * scale,
                width: box[2]! * scale,
                height: box[3]! * scale,
              },
            ),
          ),
        );
      }
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [unit, theme, viewport, camera, labels, data, bookAction]);

  const activate = (label: IllustrationLabel, origin: HTMLElement) => {
    recordModalOrigin(origin.getBoundingClientRect());
    if (label.bookId) {
      requestBookPrefetch(label.bookId);
      useStacks.getState().setPendingBookId(label.bookId);
    } else if (label.href) {
      if (label.href.startsWith("/")) openSheetRoute(label.href, router);
      else window.open(label.href, "_blank", "noopener,noreferrer");
      recordFieldNoteEvent({
        type: "portal-activated",
        portalId: `illustration:${label.id}`,
        unitIndex: unit,
        destination: label.destination ?? label.href,
      });
    }
  };
  return (
    <div ref={layer} className="room-illustration-hotspots">
      {targets.map(({ label, artifact, style }) =>
        artifact ? (
          // A print opens on the first click with nothing shown first. There
          // is no title here on purpose, and none in the accessible name
          // either: an artifact's title names the file, not the picture.
          <button
            key={artifact}
            type="button"
            aria-label="View photo"
            className="room-illustration-hotspot"
            style={style}
            onClick={(event) => {
              if (illustrationInteraction.moving) return;
              recordModalOrigin(event.currentTarget.getBoundingClientRect());
              openSceneArtifact(artifact);
            }}
          />
        ) : label ? (
          <IllustrationObjectLabel
            key={label.id}
            label={label}
            style={style}
            open={selected === label.id}
            onOpenChange={(open) =>
              setSelected((current) =>
                open ? label.id : current === label.id ? null : current,
              )
            }
            onActivate={activate}
          />
        ) : null,
      )}
    </div>
  );
}
