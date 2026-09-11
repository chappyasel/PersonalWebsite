// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { SceneStartupGate } from "./SceneStartupGate";
import { useRouteTransitionPrototype } from "./store";

afterEach(() => {
  cleanup();
  useRouteTransitionPrototype.setState({
    enabled: true,
    deferSceneStartup: false,
  });
});

it("defers the first canvas but never tears down an already-mounted room", () => {
  const mount = vi.fn();
  const unmount = vi.fn();
  function Canvas() {
    useEffect(() => {
      mount();
      return unmount;
    }, []);
    return <span>canvas</span>;
  }
  useRouteTransitionPrototype.setState({
    enabled: true,
    deferSceneStartup: true,
  });
  render(
    <SceneStartupGate>
      <Canvas />
    </SceneStartupGate>,
  );
  expect(screen.queryByText("canvas")).toBeNull();
  void act(() =>
    useRouteTransitionPrototype.setState({ deferSceneStartup: false }),
  );
  expect(screen.getByText("canvas")).toBeDefined();
  void act(() =>
    useRouteTransitionPrototype.setState({ deferSceneStartup: true }),
  );
  expect(screen.getByText("canvas")).toBeDefined();
  expect(mount).toHaveBeenCalledOnce();
  expect(unmount).not.toHaveBeenCalled();
});
