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
  id: "frames" | "quality" | "effects" | "load";
  segments: readonly DevHudSegment[];
}>;

export type DevHudInput = Readonly<{
  fps: number;
  profile: string | null;
  mode: string | null;
  moving: boolean | null;
  frozen: boolean | null;
  customOverrides: boolean | null;
  fallbackStatus: string | null;
  p95: number | null;
  targetFrameMs: number | null;
  droppedFrameRatio: number | null;
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
  calls: number | null;
  triangles: number | null;
  textures: number | null;
  programs: number | null;
}>;

function compactCount(value: number | null) {
  if (value == null) return "–";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function compactMegapixels(value: number | null) {
  return value == null ? "–" : (value / 1_000_000).toFixed(1);
}

/** A null profile means the scene hooks are not installed, which is a
 * misconfiguration rather than a slow frame. "Waiting" read as "hold on a
 * moment" and never resolved, which is the worst of both: it hid a broken
 * data source behind something that looked transient. Name the actual
 * condition and the way out of it. */
function profileLabel(profile: string | null) {
  return profile == null
    ? "NO SCENE HOOKS"
    : `${profile.charAt(0).toUpperCase()}${profile.slice(1)}`;
}

function trimScale(value: number | null) {
  return value == null
    ? "–"
    : value.toFixed(2).replace(/^0/, "").replace(/0$/, "");
}

function aoQualityLabel(value: string | null) {
  return (
    {
      performance: "P",
      low: "L",
      medium: "M",
      high: "H",
      ultra: "U",
    }[value ?? ""] ?? "–"
  );
}

function frameTone(input: DevHudInput): DevHudTone {
  if (
    input.p95 == null ||
    input.targetFrameMs == null ||
    input.droppedFrameRatio == null
  )
    return "muted";
  if (input.p95 > input.targetFrameMs * 1.75 || input.droppedFrameRatio > 0.35)
    return "danger";
  if (input.p95 > input.targetFrameMs * 1.25 || input.droppedFrameRatio > 0.15)
    return "warning";
  return "positive";
}

/** The compact HUD's sole presentation interface. Sampling and scene policy
 * stay outside; width-safe formatting, hierarchy, and semantic tone stay here. */
export function createDevHudRows(input: DevHudInput): readonly DevHudRow[] {
  const performanceTone = frameTone(input);
  const p95 = input.p95?.toFixed(1) ?? "–";
  const target = input.targetFrameMs?.toFixed(1) ?? "–";
  const drops =
    input.droppedFrameRatio == null
      ? "–"
      : `${Math.round(input.droppedFrameRatio * 100)}%`;
  const mode =
    input.mode == null ? "–" : input.mode === "auto" ? "Auto" : "Manual";
  const bloom =
    input.bloomLevels != null && input.bloomLevels > 0
      ? `B${input.bloomLevels}`
      : "B–";
  const ao = input.ambientOcclusion
    ? `AO${input.ambientOcclusionHalfRes ? "½" : ""}${aoQualityLabel(
        input.ambientOcclusionQuality,
      )}`
    : "AO–";
  const dof = input.depthOfField
    ? `DoF q${trimScale(input.depthOfFieldResolutionScale)}/b${trimScale(
        input.depthOfFieldBokehScale,
      )}`
    : "DoF–";
  const statusCandidates: Array<DevHudSegment | null> = [
    input.fallbackStatus?.startsWith("direct")
      ? { text: "DIRECT", tone: "danger", emphasis: true }
      : null,
    input.frozen ? { text: "FROZEN", tone: "warning", emphasis: true } : null,
    input.customOverrides
      ? { text: "CUSTOM", tone: "accent", emphasis: true }
      : null,
    input.moving ? { text: "TRAVEL", tone: "accent", emphasis: true } : null,
  ];
  const statuses = statusCandidates.filter(
    (segment): segment is DevHudSegment => segment != null,
  );
  const enabledTone = (enabled: boolean | null): DevHudTone =>
    enabled ? "accent" : "muted";

  return [
    {
      id: "frames",
      segments: [
        {
          text: `${Math.round(input.fps)} FPS`,
          tone: performanceTone,
          emphasis: true,
        },
        { text: " · p95 ", tone: "muted" },
        { text: p95, tone: performanceTone, emphasis: true },
        { text: `/${target}ms`, tone: "muted" },
        { text: " · ", tone: "muted" },
        { text: `${drops} drop`, tone: performanceTone, emphasis: true },
      ],
    },
    {
      id: "quality",
      segments: [
        {
          text: profileLabel(input.profile),
          tone: "accent",
          emphasis: true,
        },
        { text: `/${mode} · `, tone: "muted" },
        {
          text: `${compactMegapixels(input.physicalPixels)}/${compactMegapixels(input.pixelBudget)}MP`,
          emphasis: true,
        },
        { text: ` @${input.dpr?.toFixed(2) ?? "–"}×`, tone: "muted" },
      ],
    },
    {
      id: "effects",
      segments: [
        {
          text: bloom,
          tone: input.bloomLevels ? "accent" : "muted",
          emphasis: true,
        },
        { text: " · ", tone: "muted" },
        { text: ao, tone: enabledTone(input.ambientOcclusion), emphasis: true },
        { text: " · ", tone: "muted" },
        { text: dof, tone: enabledTone(input.depthOfField), emphasis: true },
        ...statuses.flatMap((status) => [
          { text: " · ", tone: "muted" as const },
          status,
        ]),
      ],
    },
    {
      id: "load",
      segments: [
        { text: compactCount(input.calls), emphasis: true },
        { text: " calls · ", tone: "muted" },
        { text: compactCount(input.triangles), emphasis: true },
        { text: " tri · ", tone: "muted" },
        { text: compactCount(input.textures), emphasis: true },
        { text: " tex · ", tone: "muted" },
        { text: compactCount(input.programs), emphasis: true },
        { text: " prog", tone: "muted" },
      ],
    },
  ];
}
