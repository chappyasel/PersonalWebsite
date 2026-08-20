import { describe, expect, it, vi } from "vitest";

import {
  scenePointerMoveWithoutCoarseHover,
  shouldSkipSceneHoverRaycast,
} from "./scenePointerEvents";

const pointer = (pointerType: "mouse" | "pen" | "touch") =>
  ({ pointerType }) as PointerEvent;

describe("scene pointer events", () => {
  it("drops coarse touch moves before React Three Fiber can raycast", () => {
    const onPointerMove = vi.fn();
    const move = scenePointerMoveWithoutCoarseHover(true, onPointerMove);

    move(pointer("touch"));

    expect(shouldSkipSceneHoverRaycast(true, pointer("touch"))).toBe(true);
    expect(onPointerMove).not.toHaveBeenCalled();
  });

  it("keeps fine-pointer hover and coarse pointer-down activation intact", () => {
    const onPointerMove = vi.fn();
    const onPointerDown = vi.fn();
    const handlers = {
      onPointerMove: scenePointerMoveWithoutCoarseHover(true, onPointerMove),
      onPointerDown,
    };

    handlers.onPointerMove(pointer("mouse"));
    handlers.onPointerDown(pointer("touch"));

    expect(onPointerMove).toHaveBeenCalledOnce();
    expect(onPointerDown).toHaveBeenCalledOnce();
  });
});
