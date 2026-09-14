"use client";

import {
  ABOUT_BOOT_STAGE_GEOMETRY,
  ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY,
  aboutBootStageForViewport,
} from "../boot/aboutBootStage";
import { SCENE_TO_BOOT_SVG } from "../dom/bootVignette";
import type { AboutBootCamera } from "../scene/aboutBootPerspective";
import { SHELF_GEOMETRY, SHELF_PLANKS } from "../scene/shelfGeometry";
import { RAIL_RIGHT_PX_FALLBACK, unitPose } from "../scene/worldLayout";
import { railRightPxRef } from "../store";
import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useState,
} from "react";

import { getRoomArtwork } from "./artwork";
import { artworkFrame } from "./artworkFrame";
import { emptyAboutShelf } from "./emptyAboutShelf";
import "./illustrationFrame.css";

type FrameVariants = Record<string, ReturnType<typeof getRoomArtwork>>;

/** Sets the frame variables before paint, for the server shell only. Nothing has
 * run React yet there, so the geometry travels as source. `emptyAbout` also
 * patches About's plank and support faces in place, using the same values. */
export function prepaintGeometryScript(
  unitIndex: number,
  variants: FrameVariants,
  emptyAbout: boolean,
) {
  const aboutScript =
    unitIndex === 0
      ? `(${emptyAboutShelf.toString()})({...s.camera,unitYaw:${unitPose(0).rotation[1]}},${JSON.stringify(SHELF_PLANKS)},${JSON.stringify(SHELF_GEOMETRY)},${SCENE_TO_BOOT_SVG})`
      : "null";
  const viewBox = ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY.viewBox;
  return (
    `try{var s=(${aboutBootStageForViewport.toString()})(innerWidth,innerHeight,${RAIL_RIGHT_PX_FALLBACK},${JSON.stringify(ABOUT_BOOT_STAGE_GEOMETRY)},${unitIndex});var a=${aboutScript};var c=a?(a.centerY/${SCENE_TO_BOOT_SVG}+${viewBox.originY})/${viewBox.height}:0.5;var v=${JSON.stringify(variants)};for(var k in v){var b=(${artworkFrame.toString()})(v[k],s,innerWidth,innerHeight);for(var p of ["x","y","width","height"])document.documentElement.style.setProperty("--room-frame-${unitIndex}-"+k+"-"+p,b[p]+"px");document.documentElement.style.setProperty("--room-frame-${unitIndex}-"+k+"-wood-center-y",(b.height*(v[k]?.shelfCenterY??c))+"px");}}catch(e){}` +
    (emptyAbout
      ? `try{var e=document.currentScript.parentElement;for(var f of a.faces){e.querySelector('[data-boot-plank-top][data-shelf-id="'+f.id+'"]').setAttribute("points",f.top);e.querySelector('[data-boot-plank][data-shelf-id="'+f.id+'"]').setAttribute("points",f.front);for(var k of ["left","right"]){var n=e.querySelector('[data-boot-plank-side="'+k+'"][data-shelf-id="'+f.id+'"]');n.setAttribute("points",f[k].points);n.setAttribute("visibility",f[k].visible?"visible":"hidden");}}for(var b of a.supports)for(var k of ["upright","foot"]){var n=e.querySelector('[data-boot-support-'+k+'="'+b.side+'"]');for(var p in b[k].faces){var q=n.querySelector('[data-boot-box-face="'+p+'"]'),v=b[k].faces[p];q.setAttribute("points",v.points);q.setAttribute("visibility",v.visible?"visible":"hidden");}}}catch(e){}`
      : "")
  );
}

/** The same camera math positions the first paint, the hydrated SVG and 3D. */
export function IllustrationFrame({
  unitIndex,
  children,
  style,
  emptyAbout = false,
  prepaint = false,
}: {
  unitIndex: number;
  children: ReactNode | ((camera?: AboutBootCamera) => ReactNode);
  style?: CSSProperties;
  emptyAbout?: boolean;
  /** Emit the pre-paint geometry script. The server shell needs it; a hydrated
   * frame gets the same variables from the layout effect below. */
  prepaint?: boolean;
}) {
  const [camera, setCamera] = useState<AboutBootCamera>();
  const variants = Object.fromEntries(
    ["light", "dark"].flatMap((theme) =>
      ["desktop", "phone"].map((viewport) => [
        `${theme}-${viewport}`,
        getRoomArtwork(
          unitIndex,
          theme as "light" | "dark",
          viewport as "desktop" | "phone",
        ),
      ]),
    ),
  );
  const variables: Record<string, string> = {};
  for (const variant of Object.keys(variants))
    for (const key of ["x", "y", "width", "height", "wood-center-y"])
      variables[`--frame-${variant}-${key}`] =
        `var(--room-frame-${unitIndex}-${variant}-${key})`;
  useLayoutEffect(() => {
    let disposed = false;
    const update = () => {
      if (disposed) return;
      const stage = aboutBootStageForViewport(
        innerWidth,
        innerHeight,
        railRightPxRef.current || RAIL_RIGHT_PX_FALLBACK,
        ABOUT_BOOT_STAGE_GEOMETRY,
        unitIndex,
      );
      const about =
        unitIndex === 0
          ? emptyAboutShelf(
              { ...stage.camera!, unitYaw: unitPose(0).rotation[1] },
              SHELF_PLANKS,
              SHELF_GEOMETRY,
              SCENE_TO_BOOT_SVG,
            )
          : null;
      const viewBox = ABOUT_BOOT_STAGE_LAYOUT_GEOMETRY.viewBox;
      const aboutCenter = about
        ? (about.centerY / SCENE_TO_BOOT_SVG + viewBox.originY) / viewBox.height
        : 0.5;
      for (const [variant, source] of Object.entries(variants)) {
        const box = artworkFrame(source, stage, innerWidth, innerHeight);
        for (const key of ["x", "y", "width", "height"] as const)
          document.documentElement.style.setProperty(
            `--room-frame-${unitIndex}-${variant}-${key}`,
            `${box[key]}px`,
          );
        document.documentElement.style.setProperty(
          `--room-frame-${unitIndex}-${variant}-wood-center-y`,
          `${box.height * (source?.shelfCenterY ?? aboutCenter)}px`,
        );
      }
      const pose = stage.camera!;
      setCamera({
        eye: pose.eye,
        aim: pose.aim,
        unitYaw: unitPose(unitIndex).rotation[1],
      });
    };
    update();
    const rail = document.querySelector(".stacks-unit-rail-desktop");
    const observer = new ResizeObserver(update);
    if (rail) observer.observe(rail);
    void document.fonts?.ready.then(update);
    window.addEventListener("resize", update);
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
    // Variant metadata is immutable; viewport changes resolve through update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIndex]);
  return (
    <div
      className="room-illustration-stage"
      data-rest-frame
      style={{ ...style, ...variables } as CSSProperties}
    >
      {typeof children === "function" ? children(camera) : children}
      {prepaint && (
        <script
          dangerouslySetInnerHTML={{
            __html: prepaintGeometryScript(unitIndex, variants, emptyAbout),
          }}
        />
      )}
    </div>
  );
}
