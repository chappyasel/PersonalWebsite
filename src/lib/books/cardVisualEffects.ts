type Listener = () => void;

const defaultSnapshot: Readonly<{
  backdropBlur: boolean;
  detailCoverTilt: boolean;
  coverLiftShadows: boolean;
}> = Object.freeze({
  backdropBlur: true,
  detailCoverTilt: true,
  coverLiftShadows: true,
});
let snapshot = defaultSnapshot;
const listeners = new Set<Listener>();

/** Session-only diagnostics; never changes the resolved scene quality. */
export const bookCardVisualEffects = {
  defaultSnapshot,
  getSnapshot: () => snapshot,
  getServerSnapshot: () => defaultSnapshot,
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setBackdropBlur: (backdropBlur: boolean) => {
    if (snapshot.backdropBlur === backdropBlur) return;
    snapshot = Object.freeze({ ...snapshot, backdropBlur });
    for (const listener of listeners) listener();
  },
  setCoverLiftShadows: (coverLiftShadows: boolean) => {
    if (snapshot.coverLiftShadows === coverLiftShadows) return;
    snapshot = Object.freeze({ ...snapshot, coverLiftShadows });
    for (const listener of listeners) listener();
  },
  setDetailCoverTilt: (detailCoverTilt: boolean) => {
    if (snapshot.detailCoverTilt === detailCoverTilt) return;
    snapshot = Object.freeze({ ...snapshot, detailCoverTilt });
    for (const listener of listeners) listener();
  },
};
