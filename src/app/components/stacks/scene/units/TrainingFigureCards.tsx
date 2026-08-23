"use client";

import { TRAINING_FIGURES } from "../../sceneArtifacts";
import Grabbable from "../Grabbable";
import LitImage from "../LitImage";
import { RoundedBox } from "../RoundedBox";
import React from "react";

import { TRAINING_FIGURE_CARD_LAYOUT } from "./trainingBoardLayout";

type TrainingFigure = (typeof TRAINING_FIGURES)[number];

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
      <group rotation={[0, 0, roll]}>
        <RoundedBox
          castShadow
          args={[width + 0.018, height + 0.018, 0.01]}
          radius={0.004}
          smoothness={2}
        >
          <meshStandardMaterial color="#d7cdbb" roughness={0.9} />
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
          <meshStandardMaterial
            color="#9c3f32"
            metalness={0.2}
            roughness={0.5}
          />
        </mesh>
      </group>
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
