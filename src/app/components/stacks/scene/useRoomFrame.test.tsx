// @vitest-environment jsdom
import type { RenderCallback } from "@react-three/fiber";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { overlayBackgroundMotion } from "~/lib/overlays/backgroundMotion";
import { registerOverlay } from "~/lib/overlays/coordinator";

import { InspectedObjectFrames, useRoomFrame } from "./useRoomFrame";

const frames = vi.hoisted(() => [] as RenderCallback[]);
vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: RenderCallback) => frames.push(callback),
}));
afterEach(() => {
  cleanup();
  frames.length = 0;
  overlayBackgroundMotion.setReducedMotion(true);
  overlayBackgroundMotion.setPaused(false);
  overlayBackgroundMotion.setReducedMotion(false);
});

function Frame({
  callback,
  needsFrame,
  scheduledDelta,
}: {
  callback: RenderCallback;
  needsFrame?: () => boolean;
  scheduledDelta?: (delta: number) => number;
}) {
  useRoomFrame(callback, 0, needsFrame, scheduledDelta);
  return null;
}

it("runs only the selected object and required handoff while the background is paused", () => {
  const background = vi.fn();
  const selected = vi.fn();
  const handoff = vi.fn();
  let returning = true;
  render(
    <>
      <Frame callback={background} />
      <InspectedObjectFrames.Provider value={() => true}>
        <Frame callback={selected} />
      </InspectedObjectFrames.Provider>
      <Frame callback={handoff} needsFrame={() => returning} />
    </>,
  );
  const tick = () =>
    frames.forEach((frame) =>
      frame({} as Parameters<RenderCallback>[0], 0.016),
    );
  const object = registerOverlay({ kind: "object", dismiss: vi.fn() });
  overlayBackgroundMotion.setReducedMotion(true);
  overlayBackgroundMotion.setPaused(true);
  let child: ReturnType<typeof registerOverlay> | undefined;
  try {
    tick();
    expect(background).not.toHaveBeenCalled();
    expect(selected).toHaveBeenCalledOnce();
    expect(handoff).toHaveBeenCalledOnce();
    returning = false;
    child = registerOverlay({ kind: "command", dismiss: vi.fn() });
    tick();
    expect(selected).toHaveBeenCalledOnce();
    expect(handoff).toHaveBeenCalledOnce();
    child.release();
    tick();
    expect(selected).toHaveBeenCalledTimes(2);
    object.release();
    overlayBackgroundMotion.setPaused(false);
    tick();
    expect(background).toHaveBeenCalledOnce();
  } finally {
    child?.release();
    object.release();
  }
});

it("slows scheduled background updates but keeps required handoff deltas real", () => {
  const background = vi.fn();
  const handoff = vi.fn();
  render(
    <>
      <Frame callback={background} scheduledDelta={() => 0.05} />
      <Frame callback={handoff} needsFrame={() => true} />
    </>,
  );
  overlayBackgroundMotion.setPaused(true);
  overlayBackgroundMotion.advance(0.75);
  const state = {} as Parameters<RenderCallback>[0];
  frames.forEach((frame) => frame(state, 0.016));
  expect(background).toHaveBeenCalledWith(state, 0.025, undefined);
  expect(handoff).toHaveBeenCalledWith(state, 0.016, undefined);
});

it("allows a zero-delta initialization frame when the room is running", () => {
  const callback = vi.fn();
  render(<Frame callback={callback} />);
  const state = {} as Parameters<RenderCallback>[0];
  frames.forEach((frame) => frame(state, 0));
  expect(callback).toHaveBeenCalledWith(state, 0, undefined);
});
