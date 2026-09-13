"use client";

import {
  ABOUT_BOOT_STAGE_GEOMETRY,
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

/** The same camera math positions the first paint, the hydrated SVG and 3D. */
export function IllustrationFrame({
  unitIndex,
  children,
  style,
  emptyAbout = false,
}: {
  unitIndex: number;
  children: ReactNode | ((camera?: AboutBootCamera) => ReactNode);
  style?: CSSProperties;
  emptyAbout?: boolean;
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
    for (const key of ["x", "y", "width", "height"])
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
      for (const [variant, source] of Object.entries(variants)) {
        const box = artworkFrame(source, stage, innerWidth, innerHeight);
        for (const key of ["x", "y", "width", "height"] as const)
          document.documentElement.style.setProperty(
            `--room-frame-${unitIndex}-${variant}-${key}`,
            `${box[key]}px`,
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
  const script = `try{var s=(${aboutBootStageForViewport.toString()})(innerWidth,innerHeight,${RAIL_RIGHT_PX_FALLBACK},${JSON.stringify(ABOUT_BOOT_STAGE_GEOMETRY)},${unitIndex});var v=${JSON.stringify(variants)};for(var k in v){var b=(${artworkFrame.toString()})(v[k],s,innerWidth,innerHeight);for(var p of ["x","y","width","height"])document.documentElement.style.setProperty("--room-frame-${unitIndex}-"+k+"-"+p,b[p]+"px");}}catch(e){}`;
  return (
    <div
      className="room-illustration-stage"
      data-rest-frame
      style={{ ...style, ...variables } as CSSProperties}
    >
      {typeof children === "function" ? children(camera) : children}
      <script
        dangerouslySetInnerHTML={{
          __html:
            script +
            (emptyAbout
              ? `try{var e=document.currentScript.parentElement;var a=(${emptyAboutShelf.toString()})({...s.camera,unitYaw:${unitPose(0).rotation[1]}},${JSON.stringify(SHELF_PLANKS)},${JSON.stringify(SHELF_GEOMETRY)},${SCENE_TO_BOOT_SVG});for(var f of a.faces){e.querySelector('[data-boot-plank-top][data-shelf-id="'+f.id+'"]').setAttribute("points",f.top);e.querySelector('[data-boot-plank][data-shelf-id="'+f.id+'"]').setAttribute("points",f.front);}for(var b of a.supports)for(var k of ["upright","foot"]){var n=e.querySelector('[data-boot-support-'+k+'="'+b.side+'"]');for(var p in b[k])n.setAttribute(p,b[k][p]);}}catch(e){}`
              : ""),
        }}
      />
    </div>
  );
}
