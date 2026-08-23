export const SCENE_LAYOUT_EDITOR_SENTINEL = "stacks-layout-editor-v1";
export const SCENE_LAYOUT_DRAFT_ENDPOINT = "/api/stacks-layout-draft";

export type SceneLayoutDraftPosition = readonly [number, number, number];

export type SceneLayoutDraftRecord = Readonly<{
  id: string;
  unitIndex: number;
  label: string;
  authored: SceneLayoutDraftPosition;
  preview: SceneLayoutDraftPosition;
  delta: SceneLayoutDraftPosition;
  authoredRotation: SceneLayoutDraftPosition;
  previewRotation: SceneLayoutDraftPosition;
  rotationDelta: SceneLayoutDraftPosition;
}>;

export type SceneLayoutDraft = Readonly<{
  sentinel: typeof SCENE_LAYOUT_EDITOR_SENTINEL;
  savedAt: string;
  records: readonly SceneLayoutDraftRecord[];
}>;

const isFiniteTriplet = (value: unknown): value is SceneLayoutDraftPosition =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every(
    (component) => typeof component === "number" && Number.isFinite(component),
  );

const isRecord = (value: unknown): value is SceneLayoutDraftRecord => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.label === "string" &&
    Number.isInteger(record.unitIndex) &&
    isFiniteTriplet(record.authored) &&
    isFiniteTriplet(record.preview) &&
    isFiniteTriplet(record.delta) &&
    isFiniteTriplet(record.authoredRotation) &&
    isFiniteTriplet(record.previewRotation) &&
    isFiniteTriplet(record.rotationDelta)
  );
};

export const createSceneLayoutDraft = (
  records: readonly SceneLayoutDraftRecord[],
  savedAt = new Date().toISOString(),
): SceneLayoutDraft => ({
  sentinel: SCENE_LAYOUT_EDITOR_SENTINEL,
  savedAt,
  records,
});

export const isSceneLayoutDraft = (
  value: unknown,
): value is SceneLayoutDraft => {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    draft.sentinel === SCENE_LAYOUT_EDITOR_SENTINEL &&
    typeof draft.savedAt === "string" &&
    !Number.isNaN(Date.parse(draft.savedAt)) &&
    Array.isArray(draft.records) &&
    draft.records.length <= 32 &&
    draft.records.every(isRecord)
  );
};
