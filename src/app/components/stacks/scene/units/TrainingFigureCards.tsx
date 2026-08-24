"use client";

import type { ArtifactPreviewFrameLayer } from "../../modal/artifactPreviewFrame";
import { TRAINING_FIGURES } from "../../sceneArtifacts";
import Grabbable from "../Grabbable";
import LitImage from "../LitImage";
import { RoundedBox } from "../RoundedBox";
import { useRegisterArtifactPreviewFrame } from "../artifactPreviewFrames";
import React from "react";

import { TRAINING_FIGURE_CARD_LAYOUT } from "./trainingBoardLayout";

type TrainingFigure = (typeof TRAINING_FIGURES)[number];

/** The card stock under each figure, 9 mm a side. Its tone is fixed rather
 * than the palette's paper, so the preview carries the literal colour. */
const CARD_BORDER = 0.009;
const CARD_RADIUS = 0.004;
const CARD_TONE = "#d7cdbb";
const CARD_PREVIEW_LAYERS: readonly ArtifactPreviewFrameLayer[] = [
  { inset: CARD_BORDER, tone: CARD_TONE, radius: CARD_RADIUS },
];

/** The card's own geometry, registered from under the Grabbable so the
 * preview can redraw its edges. */
function FigureCardStock({
  figure,
  width,
  height,
  roll,
}: {
  figure: TrainingFigure;
  width: number;
  height: number;
  roll: number;
}) {
  useRegisterArtifactPreviewFrame(width, height, CARD_PREVIEW_LAYERS);
  return (
    <group rotation={[0, 0, roll]}>
      <RoundedBox
        castShadow
        args={[width + CARD_BORDER * 2, height + CARD_BORDER * 2, 0.01]}
        radius={CARD_RADIUS}
        smoothness={2}
      >
        <meshStandardMaterial color={CARD_TONE} roughness={0.9} />
      </RoundedBox>
      <React.Suspense fallback={null}>
        <LitImage
          url={figure.image}
          width={width}
          height={height}
          grade={0}
          roughness={0.88}
          position={[0, 0, 0.009]}
        />
      </React.Suspense>
      <mesh position={[0, height / 2 - 0.008, 0.02]}>
        <sphereGeometry args={[0.009, 10, 10]} />
        <meshStandardMaterial color="#9c3f32" metalness={0.2} roughness={0.5} />
      </mesh>
    </group>
  );
}

function FigureCard({
  unitIndex,
  figure,
  x,
  top,
  width,
  heightRatio,
  roll,
}: {
  unitIndex: number;
  figure: TrainingFigure;
  x: number;
  top: number;
  width: number;
  heightRatio: number;
  roll: number;
}) {
  const { id } = figure;
  const height = width * heightRatio;

  return (
    <Grabbable
      unitIndex={unitIndex}
      hoverKey={`action:training-figure:${id}`}
      base={[x, top - height / 2, 0.036]}
      shadeColor="#16130f"
      shadeWidth={width}
      shape="box"
      massKg={0.08}
      physics={false}
      draggable={false}
      artifact={id}
    >
      <FigureCardStock
        figure={figure}
        width={width}
        height={height}
        roll={roll}
      />
    </Grabbable>
  );
}

export function TrainingFigureCards({ unitIndex }: { unitIndex: number }) {
  return (
    <group>
      {TRAINING_FIGURES.map((figure, index) => (
        <FigureCard
          key={figure.id}
          unitIndex={unitIndex}
          figure={figure}
          {...TRAINING_FIGURE_CARD_LAYOUT[index]!}
        />
      ))}
    </group>
  );
}
