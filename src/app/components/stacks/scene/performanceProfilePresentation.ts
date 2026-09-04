import {
  type PerformanceProfile,
  type PerformanceProfileId,
} from "./performanceProfiles";

/** Copy used only by the lazily loaded diagnostics console. Keeping it out of
 * the scene runtime means ordinary visitors do not download support prose. */
export const PERFORMANCE_PROFILE_PRESENTATION: Readonly<
  Record<PerformanceProfileId, Readonly<{ label: string; question: string }>>
> = Object.freeze({
  constrained: {
    label: "Constrained control",
    question:
      "The combined low-cost control: does the complaint survive with every scalable cost lowered at once? If it does, preset, resolution, composer, prewarm, photo residency, and the meadow are not the cause.",
  },
  "unknown-device": {
    label: "Unknown device",
    question:
      "What does Auto choose on this machine with no learned profile to restore?",
  },
  floor: {
    label: "Production floor",
    question:
      "Does the complaint survive at Safety, the cheapest preset Auto can choose?",
  },
  "low-dpr": {
    label: "Low DPR",
    question:
      "Is the frame fill-rate bound? Auto's starting point, rendered at 1x and held there.",
  },
  "no-composer": {
    label: "No composer",
    question:
      "How much of the frame is the finishing composer? Auto's starting point, rendered directly and held there.",
  },
  "light-boot": {
    label: "Light boot",
    question:
      "Is boot time spent in all-unit prewarm or full-resolution photos? Both stay off; everything else is production.",
  },
  "no-meadow": {
    label: "No meadow",
    question:
      "Is the meadow instance build the boot gate? The meadow stays unmounted; everything else is production.",
  },
  "retina-stress": {
    label: "Retina stress",
    question:
      "Does a fast machine reproduce the lag once it fills the pixels of a high-density display? Showcase, forced, at a 3x ceiling.",
  },
});

/** Plain-words summary of what a profile changes, derived from its runtime
 * definition so the diagnostics explanation cannot drift from the test. */
export function describePerformanceProfile(definition: PerformanceProfile) {
  const parts: string[] = [];
  parts.push(
    definition.quality === "auto"
      ? definition.freezeAuto
        ? "Auto, frozen at its starting axes"
        : "Auto, adapting"
      : `${definition.quality} forced`,
  );
  if (definition.resolutionCeiling !== null)
    parts.push(`render scale pinned at ${definition.resolutionCeiling}x`);
  for (const [key, value] of Object.entries(definition.performance))
    parts.push(
      `${key} ${value === false ? "off" : value === true ? "on" : String(value)}`,
    );
  parts.push("learned quality ignored and not saved");
  return parts.join(" · ");
}
