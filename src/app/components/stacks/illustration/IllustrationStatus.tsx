/** The loading message stays small because the room is already usable. */
export function IllustrationStatus({ loading }: { loading: boolean }) {
  return (
    <div
      className="room-illustration-status"
      data-illustration-status={loading ? "loading" : "fallback"}
      role="status"
      aria-label="Room view"
      aria-live="polite"
      aria-atomic="true"
    >
      <span>{loading ? "Loading 3D…" : "2D view"}</span>
      {loading && <span>You can explore while it loads.</span>}
    </div>
  );
}
