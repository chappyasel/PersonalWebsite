export type DevHudTone =
  | "normal"
  | "muted"
  | "accent"
  | "positive"
  | "warning"
  | "danger";

export type DevHudSegment = Readonly<{
  text: string;
  tone?: DevHudTone;
  emphasis?: boolean;
}>;

export type DevHudRow = Readonly<{
  id: "frames" | "quality" | "axes" | "effects";
  segments: readonly DevHudSegment[];
}>;

type QualityAxis = "resolution" | "effects" | "content" | "survival";

export type DevHudInput = Readonly<{
  fps: number | null;
  hooksStatus: "starting" | "ready" | "missing";
  profile: string | null;
  mode: string | null;
  moving: boolean | null;
  frozen: boolean | null;
  customOverrides: boolean | null;
  fallbackStatus: string | null;
  p95: number | null;
  targetFrameMs: number | null;
  droppedFrameRatio: number | null;
  resolutionStep: number | null;
  effectsTier: "cinematic" | "full" | "lean" | "minimal" | null;
  contentTier: "full" | "reduced" | "minimal" | null;
  survival: boolean | null;
  constraint: "cpu" | "gpu" | "headroom" | "unknown" | null;
  lastTransition: Readonly<{
    axis: QualityAxis;
    direction: "down" | "up";
    ageMs: number;
  }> | null;
  dpr: number | null;
  physicalPixels: number | null;
  pixelBudget: number | null;
  bloomLevels: number | null;
  ambientOcclusion: boolean | null;
  ambientOcclusionHalfRes: boolean | null;
  ambientOcclusionQuality: string | null;
  depthOfField: boolean | null;
  depthOfFieldResolutionScale: number | null;
  depthOfFieldBokehScale: number | null;
}>;

const separator: DevHudSegment = { text: " · ", tone: "muted" };

function compactMegapixels(value: number | null) {
  return value == null ? "–" : (value / 1_000_000).toFixed(1);
}

function trimScale(value: number | null) {
  return value == null
    ? "–"
    : value.toFixed(2).replace(/^0/, "").replace(/0+$/, "").replace(/\.$/, "");
}

function profileLabel(input: DevHudInput): DevHudSegment {
  if (input.hooksStatus === "starting")
    return { text: "SCENE STARTING", tone: "muted", emphasis: true };
  if (input.hooksStatus === "missing")
    return { text: "NO SCENE HOOKS", tone: "danger", emphasis: true };
  if (input.profile == null)
    return { text: "CALIBRATING", tone: "warning", emphasis: true };
  return {
    text:
      {
        cinematic: "Cine",
        showcase: "Show",
        balanced: "Bal",
        efficient: "Eff",
        safety: "Safe",
      }[input.profile] ??
      `${input.profile.charAt(0).toUpperCase()}${input.profile.slice(1)}`,
    tone: "accent",
    emphasis: true,
  };
}

function fpsTone(value: number | null): DevHudTone {
  if (value == null) return "muted";
  if (value < 50) return "danger";
  if (value < 58) return "warning";
  return "positive";
}

function p95Tone(value: number | null, target: number | null): DevHudTone {
  if (value == null || target == null) return "muted";
  if (value > target * 1.75) return "danger";
  if (value > target * 1.25) return "warning";
  return "positive";
}

function droppedTone(value: number | null): DevHudTone {
  if (value == null) return "muted";
  if (value >= 0.08) return "danger";
  if (value >= 0.03) return "warning";
  return "positive";
}

function aoLabel(input: DevHudInput) {
  if (!input.ambientOcclusion) return "AO–";
  const quality =
    {
      performance: "P",
      low: "L",
      medium: "M",
      high: "H",
      ultra: "U",
    }[input.ambientOcclusionQuality ?? ""] ?? "–";
  return `AO${input.ambientOcclusionHalfRes ? "½" : ""}${quality}`;
}

function effectsTierLabel(value: DevHudInput["effectsTier"]) {
  if (value == null) return "E–";
  return {
    cinematic: "EC",
    full: "EF",
    lean: "EL",
    minimal: "EM",
  }[value];
}

function contentTierLabel(value: DevHudInput["contentTier"]) {
  if (value == null) return "C–";
  return {
    full: "CF",
    reduced: "CR",
    minimal: "CM",
  }[value];
}

function recentAxis(
  base: string,
  axis: QualityAxis,
  transition: DevHudInput["lastTransition"],
): DevHudSegment {
  if (transition?.axis !== axis || transition.ageMs > 5_000)
    return { text: base, tone: "accent", emphasis: true };
  const direction = transition.direction === "down" ? "down" : "up";
  const seconds = Math.max(1, Math.ceil(transition.ageMs / 1_000));
  return {
    text: `${base} ${direction} ${seconds}s`,
    tone: transition.direction === "down" ? "warning" : "positive",
    emphasis: true,
  };
}

function constraintSegment(value: DevHudInput["constraint"]): DevHudSegment {
  if (value === "cpu" || value === "gpu")
    return { text: value.toUpperCase(), tone: "danger", emphasis: true };
  if (value === "headroom")
    return { text: "HEAD", tone: "positive", emphasis: true };
  if (value === "unknown")
    return { text: "HOLD", tone: "warning", emphasis: true };
  return { text: "WAIT", tone: "muted", emphasis: true };
}

function runtimeStatus(input: DevHudInput): DevHudSegment | null {
  if (input.fallbackStatus?.startsWith("direct"))
    return { text: "DIRECT", tone: "danger", emphasis: true };
  if (input.survival)
    return { text: "SURVIVAL", tone: "warning", emphasis: true };
  if (input.frozen) return { text: "FROZEN", tone: "warning", emphasis: true };
  if (input.customOverrides)
    return { text: "CUSTOM", tone: "accent", emphasis: true };
  if (input.moving) return { text: "TRAVEL", tone: "accent", emphasis: true };
  return null;
}

/** Format the compact HUD into four width-bounded, position-stable rows. */
export function createDevHudRows(input: DevHudInput): readonly DevHudRow[] {
  const ready = input.hooksStatus === "ready";
  const fps = ready ? input.fps : null;
  const p95 = ready ? input.p95 : null;
  const dropped = ready ? input.droppedFrameRatio : null;
  const profile = profileLabel(input);
  const status = runtimeStatus(input);
  const qualitySegments: DevHudSegment[] = [profile];

  if (ready && input.profile != null) {
    qualitySegments.push(
      {
        text: ` ${input.mode === "auto" ? "A" : "M"}`,
        tone: "accent",
        emphasis: true,
      },
      separator,
      {
        text: `${trimScale(input.dpr)}×`,
        emphasis: true,
      },
      separator,
      {
        text: `${compactMegapixels(input.physicalPixels)}/${compactMegapixels(input.pixelBudget)}MP`,
        emphasis: true,
      },
    );
  }

  const effectSegments: DevHudSegment[] = [
    {
      text:
        input.bloomLevels != null && input.bloomLevels > 0
          ? `B${input.bloomLevels}`
          : "B–",
      tone: input.bloomLevels ? "accent" : "muted",
      emphasis: true,
    },
    separator,
    {
      text: aoLabel(input),
      tone: input.ambientOcclusion ? "accent" : "muted",
      emphasis: true,
    },
    separator,
    {
      text: input.depthOfField
        ? `D${trimScale(input.depthOfFieldResolutionScale)}/${trimScale(input.depthOfFieldBokehScale)}`
        : "D–",
      tone: input.depthOfField ? "accent" : "muted",
      emphasis: true,
    },
  ];
  if (status) effectSegments.push(separator, status);

  return [
    {
      id: "frames",
      segments: [
        {
          text: `${fps == null ? "–" : Math.round(fps)} FPS`,
          tone: fpsTone(fps),
          emphasis: true,
        },
        separator,
        {
          text: `${p95 == null ? "–" : p95.toFixed(1)}ms`,
          tone: p95Tone(p95, input.targetFrameMs),
          emphasis: true,
        },
        separator,
        {
          text: `${dropped == null ? "–" : Math.round(dropped * 100)}%`,
          tone: droppedTone(dropped),
          emphasis: true,
        },
      ],
    },
    { id: "quality", segments: qualitySegments },
    {
      id: "axes",
      segments: [
        recentAxis(
          `R${input.resolutionStep ?? "–"}`,
          "resolution",
          input.lastTransition,
        ),
        separator,
        recentAxis(
          effectsTierLabel(input.effectsTier),
          "effects",
          input.lastTransition,
        ),
        separator,
        recentAxis(
          contentTierLabel(input.contentTier),
          "content",
          input.lastTransition,
        ),
        separator,
        constraintSegment(input.constraint),
      ],
    },
    { id: "effects", segments: effectSegments },
  ];
}
