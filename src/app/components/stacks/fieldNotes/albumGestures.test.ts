import { describe, expect, it } from "vitest";

import {
  ALBUM_DISMISS_SWIPE_PX,
  ALBUM_PAGE_SWIPE_PX,
  ALBUM_SWIPE_SLOP_PX,
  type AlbumSwipeState,
  beginAlbumSwipe,
  moveAlbumSwipe,
  releaseAlbumSwipe,
} from "./albumGestures";

function swipe(points: readonly (readonly [number, number])[]) {
  const [first, ...rest] = points;
  let state: AlbumSwipeState = beginAlbumSwipe(first![0], first![1]);
  const claims: boolean[] = [];
  for (const [x, y] of rest.slice(0, -1)) {
    const step = moveAlbumSwipe(state, x, y);
    state = step.state;
    claims.push(step.claimed);
  }
  const last = rest.at(-1) ?? first!;
  const step = moveAlbumSwipe(state, last[0], last[1]);
  claims.push(step.claimed);
  return { action: releaseAlbumSwipe(step.state, last[0], last[1]), claims };
}

describe("album swipe arbitration", () => {
  it("treats movement inside the slop as a tap for the controls beneath", () => {
    const { action, claims } = swipe([
      [200, 300],
      [200 + ALBUM_SWIPE_SLOP_PX - 1, 300],
    ]);

    expect(claims).toEqual([false]);
    expect(action).toBe("none");
  });

  it("claims a dominant leftward drag exactly once and pages forward", () => {
    const { action, claims } = swipe([
      [200, 300],
      [180, 302],
      [140, 305],
      [200 - ALBUM_PAGE_SWIPE_PX, 306],
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(action).toBe("next");
  });

  it("pages backward on a dominant rightward drag", () => {
    const { action } = swipe([
      [120, 300],
      [160, 296],
      [120 + ALBUM_PAGE_SWIPE_PX, 295],
    ]);

    expect(action).toBe("previous");
  });

  it("does not page when a claimed drag returns under the commit distance", () => {
    const { action, claims } = swipe([
      [200, 300],
      [160, 300],
      [200 - ALBUM_PAGE_SWIPE_PX + 1, 300],
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(action).toBe("none");
  });

  it("dismisses on a dominant downward drag past the commit distance", () => {
    const { action } = swipe([
      [200, 200],
      [202, 240],
      [204, 200 + ALBUM_DISMISS_SWIPE_PX],
    ]);

    expect(action).toBe("dismiss");
  });

  it("never dismisses upward", () => {
    const { action } = swipe([
      [200, 400],
      [202, 340],
      [204, 400 - ALBUM_DISMISS_SWIPE_PX * 2],
    ]);

    expect(action).toBe("none");
  });

  it("locks the first dominant axis for the rest of the gesture", () => {
    // Locks horizontal, then wanders far downward: still a page turn.
    const { action } = swipe([
      [200, 200],
      [160, 202],
      [140, 380],
    ]);

    expect(action).toBe("next");
  });

  it("stays undecided on an even diagonal until one axis dominates", () => {
    let state = beginAlbumSwipe(200, 200);
    const diagonal = moveAlbumSwipe(state, 220, 220);
    expect(diagonal.claimed).toBe(false);
    expect(diagonal.state.axis).toBeNull();

    state = diagonal.state;
    const horizontal = moveAlbumSwipe(state, 260, 221);
    expect(horizontal.claimed).toBe(true);
    expect(horizontal.state.axis).toBe("horizontal");
  });
});
