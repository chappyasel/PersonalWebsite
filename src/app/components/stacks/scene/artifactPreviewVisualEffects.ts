export type ArtifactPreviewVisualEffects = Readonly<{
  backdropBlur: boolean;
}>;

type Listener = () => void;

const DEFAULT_VISUAL_EFFECTS: ArtifactPreviewVisualEffects = Object.freeze({
  backdropBlur: true,
});

let snapshot = DEFAULT_VISUAL_EFFECTS;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export const artifactPreviewVisualEffects = {
  defaultSnapshot: DEFAULT_VISUAL_EFFECTS,
  getSnapshot: () => snapshot,
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setBackdropBlur: (enabled: boolean) => {
    if (snapshot.backdropBlur === enabled) return;
    snapshot = Object.freeze({ ...snapshot, backdropBlur: enabled });
    emit();
  },
  resetForTests: () => {
    snapshot = DEFAULT_VISUAL_EFFECTS;
    emit();
  },
} as const;
