"use client";

import Grabbable from "../Grabbable";
import {
  GOLF_BALL_RADIUS,
  createDimpledGolfBallGeometry,
  createGolfBallBumpTexture,
} from "../units/trainingGolfBall";
import type { UnitProps } from "../units/types";
import type { ShelfPlane } from "../physics";
import React from "react";

import { GOLF_BALL_FINISH } from "./golfPresentation";

/** One dimpled geometry and bump map for every golf ball on the page, the
 * props here and the ghosts GolfExperience flies. */
export const GOLF_BALL_GEOMETRY = createDimpledGolfBallGeometry();
export const GOLF_BALL_BUMP = createGolfBallBumpTexture();
export const GOLF_BALL_MASS_KG = 0.046;

/** A golf ball you can pick up. It is an ordinary Grabbable sphere in the
 * rigid body world, so it drags, throws and rolls like the basketball; what
 * makes it a golf ball is `hittable.golf`: left still in the bay and tapped,
 * the club swings and the bay flies the authored shot for it. The four in
 * the bay and the two on the lower shelf are the same component. The
 * hoverKey keeps the `golf-ball:` prefix the camera and cursor rules key on. */
export function GolfBallProp({
  unitIndex,
  palette,
  dark,
  id,
  base,
  standsOn,
  yaw = 0,
}: Pick<UnitProps, "palette" | "dark"> & {
  unitIndex: number;
  id: string;
  /** The ball's bottom. */
  base: [number, number, number];
  standsOn?: ShelfPlane;
  yaw?: number;
}) {
  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={`golf-ball:${id}`}
      base={base}
      shadeColor={palette.shadow}
      shadeWidth={0.1}
      shape="sphere"
      massKg={GOLF_BALL_MASS_KG}
      restitution={0.55}
      maxThrowSpeed={9}
      standsOn={standsOn}
      activateOnFirstTouch
      hittable={{ radius: GOLF_BALL_RADIUS, golf: true }}
    >
      <group position={[0, GOLF_BALL_RADIUS, 0]} rotation={[0, yaw, 0]}>
        <mesh castShadow dispose={null} geometry={GOLF_BALL_GEOMETRY}>
          <meshStandardMaterial
            bumpMap={GOLF_BALL_BUMP}
            bumpScale={0.01}
            color={dark ? GOLF_BALL_FINISH.dark : palette.pages}
            fog={GOLF_BALL_FINISH.fog}
            metalness={0}
            roughness={
              dark
                ? GOLF_BALL_FINISH.darkRoughness
                : GOLF_BALL_FINISH.lightRoughness
            }
          />
        </mesh>
        <mesh position={[0, 0, 0.0504]}>
          <planeGeometry args={[0.035, 0.006]} />
          <meshBasicMaterial
            color={dark ? GOLF_BALL_FINISH.darkMark : "#33434e"}
            fog={GOLF_BALL_FINISH.fog}
            toneMapped={false}
          />
        </mesh>
      </group>
    </Grabbable>
  );
}
