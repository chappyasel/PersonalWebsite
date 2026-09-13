// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { RoomActivityContext, useRoomActive } from "./ResidentRoomHost";

vi.mock("./roomResidency", () => ({
  roomResidency: {
    subscribe: () => () => undefined,
    getSnapshot: () => ({ active: true }),
  },
}));
afterEach(cleanup);

it("pauses the retained renderer subtree while its reader stays active, without remounting it", () => {
  const mounted = vi.fn();
  const unmounted = vi.fn();
  function Renderer() {
    const active = useRoomActive();
    useEffect(() => {
      mounted();
      return unmounted;
    }, []);
    return <span data-testid="renderer">{active ? "running" : "paused"}</span>;
  }
  function Reader() {
    return (
      <span data-testid="reader">{useRoomActive() ? "active" : "paused"}</span>
    );
  }
  const content = (cached: boolean) => (
    <>
      <Reader />
      <RoomActivityContext.Provider value={!cached}>
        <Renderer />
      </RoomActivityContext.Provider>
    </>
  );
  const view = render(content(false));
  view.rerender(content(true));
  expect(view.getByTestId("renderer").textContent).toBe("paused");
  expect(view.getByTestId("reader").textContent).toBe("active");
  view.rerender(content(false));
  expect(view.getByTestId("renderer").textContent).toBe("running");
  expect(mounted).toHaveBeenCalledOnce();
  expect(unmounted).not.toHaveBeenCalled();
  view.unmount();
  expect(unmounted).toHaveBeenCalledOnce();
});
