// Where a sheet came from. The launcher records its source rect (a placard's
// real box, or a small rect around the pointer for a 3D door, which has no
// DOM box — the same reason the stacks book modal uses a shell transition),
// and DaylightSheet pops from it, book-notes style. sessionStorage because
// the record has to survive the soft navigation into the intercepted route.

const KEY = "dl-sheet-origin";
const FRESH_MS = 3000;

export type SheetOrigin = { l: number; t: number; w: number; h: number };

export function recordSheetOrigin(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        l: rect.left,
        t: rect.top,
        w: rect.width,
        h: rect.height,
        ts: Date.now(),
      }),
    );
  } catch {
    // Storage blocked: the sheet falls back to its centered entrance.
  }
}

export function takeSheetOrigin(): SheetOrigin | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const origin = JSON.parse(raw) as SheetOrigin & { ts: number };
    if (Date.now() - origin.ts > FRESH_MS) return null;
    return origin;
  } catch {
    return null;
  }
}
