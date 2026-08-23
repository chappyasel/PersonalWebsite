import { DAYLIGHT_RENDERING } from "./daylightRendering";
import { DEFAULT_SCENE_COLOR_GRADE } from "./sceneColorGrade";

export type ProjectArtifactLighting = Readonly<{
  exposure: number;
  environmentIntensity: number;
  hemisphere: Readonly<{
    color: string;
    groundColor: string;
    intensity: number;
  }>;
  key: Readonly<{
    color: string;
    intensity: number;
    position: [number, number, number];
  }>;
  warmEnvironment: Readonly<{
    color: string;
    intensity: number;
    position: [number, number, number];
  }>;
  coolEnvironment: Readonly<{
    color: string;
    intensity: number;
    position: [number, number, number];
  }>;
  groundEnvironment: Readonly<{
    color: string;
    intensity: number;
    position: [number, number, number];
  }>;
}>;

/**
 * The inspection renderer uses a second WebGL context, but it should not
 * invent a second lighting palette. These are the production Projects-room
 * colors and base intensities at the start of the light-theme dawn pass.
 */
export function projectArtifactRoomLighting(
  dark: boolean,
): ProjectArtifactLighting {
  return {
    exposure: dark
      ? DEFAULT_SCENE_COLOR_GRADE.dark.exposure
      : DEFAULT_SCENE_COLOR_GRADE.light.exposure,
    environmentIntensity: dark ? 0.45 : DAYLIGHT_RENDERING.environmentIntensity,
    hemisphere: {
      color: dark ? "#91a6c9" : "#eaf3ff",
      groundColor: dark ? "#33291f" : "#a8b2bf",
      intensity: dark ? 1.2 : DAYLIGHT_RENDERING.hemisphereIntensity[0],
    },
    key: {
      color: dark ? "#efd0b1" : "#fff3e6",
      intensity: dark ? 1.35 : DAYLIGHT_RENDERING.directionalIntensity[0],
      position: [4, 6.5, 6],
    },
    warmEnvironment: {
      color: dark ? "#ffc98f" : "#ffe4cb",
      intensity: dark ? 1.5 : DAYLIGHT_RENDERING.environmentWarmIntensity,
      position: [4, 3, 4],
    },
    coolEnvironment: {
      color: dark ? "#414f70" : "#8ca4bd",
      intensity: dark ? 1.3 : DAYLIGHT_RENDERING.environmentCoolIntensity,
      position: [-5, 2, 1],
    },
    groundEnvironment: {
      color: dark ? "#5b432c" : "#aeb4bb",
      intensity: 0.5,
      position: [0, -4, 2],
    },
  };
}

export function projectArtifactInspectionLighting(
  dark: boolean,
): ProjectArtifactLighting {
  return projectArtifactRoomLighting(dark);
}
