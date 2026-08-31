import { beforeEach, describe, expect, it, vi } from "vitest";

import { originExit } from "./originFlight";
import {
  ARTIFACT_PREVIEW_DURATION_MS,
  ARTIFACT_PREVIEW_EASING,
} from "~/app/components/stacks/modal/artifactPreviewMotion";

function animatedElement(rect: Partial<DOMRect> = {}) {
  const animations: Array<{ onfinish: null | (() => void) }> = [];
  const element = {
    animate: vi.fn(() => {
      const animation = { onfinish: null as null | (() => void) };
      animations.push(animation);
      return animation;
    }),
    getBoundingClientRect: vi.fn(() => ({
      left: 100,
      top: 80,
      width: 800,
      height: 600,
      ...rect,
    })),
  };
  return { animations, element };
}

describe("origin flight", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
  });

  it("returns to the scene origin with the established modal cadence", () => {
    const shell = animatedElement();
    const backdrop = animatedElement();
    const onFinish = vi.fn();

    expect(
      originExit(
        shell.element as unknown as HTMLElement,
        { l: 20, t: 30, w: 90, h: 130 },
        backdrop.element as unknown as HTMLElement,
        onFinish,
      ),
    ).toBe(true);

    expect(shell.element.animate).toHaveBeenNthCalledWith(
      1,
      [
        { transform: "none" },
        {
          transform: "translate(-435px, -285px) scale(0.1125)",
        },
      ],
      {
        duration: ARTIFACT_PREVIEW_DURATION_MS,
        easing: ARTIFACT_PREVIEW_EASING,
        fill: "forwards",
      },
    );
    expect(shell.element.animate).toHaveBeenNthCalledWith(
      2,
      [
        { offset: 0, opacity: 1 },
        { offset: 0.42, opacity: 1 },
        { offset: 0.82, opacity: 0 },
        { offset: 1, opacity: 0 },
      ],
      {
        duration: ARTIFACT_PREVIEW_DURATION_MS,
        easing: "linear",
        fill: "forwards",
      },
    );
    expect(backdrop.element.animate).toHaveBeenCalledWith(expect.any(Array), {
      duration: 300,
      easing: "linear",
      fill: "forwards",
    });
    expect(shell.animations[0]?.onfinish).toBeNull();
    expect(shell.animations[1]?.onfinish).toBe(onFinish);
  });
});
