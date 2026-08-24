import { PROJECT_ARTIFACT_DIMENSIONS } from "./units/unitShelfLayout";

/** Physical billet proportions shared by the live ProjectIcon and boot SVG. */
export function projectIconBody(
  size: number = PROJECT_ARTIFACT_DIMENSIONS.icon,
) {
  return {
    size,
    depth: size * 0.375,
    radius: size * 0.16,
    faceInset: size * 0.04375,
    fallbackFaceDepth: 0.012,
    fallbackFaceRadius: 0.005,
  } as const;
}

export const PROJECT_ICON_BODY = projectIconBody();
