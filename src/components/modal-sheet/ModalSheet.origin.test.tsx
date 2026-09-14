// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode, Suspense, use } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { recordModalOrigin } from "~/lib/originFlight";

import ModalSheet from "./ModalSheet";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("flies from the launcher after the initial document suspends", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
  const animate = vi.fn(() => ({ cancel: vi.fn() }));
  vi.stubGlobal("Animation", class {});
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 80,
    width: 800,
    height: 600,
  } as DOMRect);
  recordModalOrigin({ left: 20, top: 30, width: 200, height: 150 });
  let resolve!: (value: string) => void;
  const ready = new Promise<string>((done) => {
    resolve = done;
  });
  function Document() {
    return <p>{use(ready)}</p>;
  }

  await act(async () => {
    render(
      <StrictMode>
        <Suspense fallback={<p>Loading</p>}>
          <ModalSheet label="Systems" expandHref="/systems">
            <Document />
          </ModalSheet>
        </Suspense>
      </StrictMode>,
    );
  });
  expect(screen.getByText("Loading")).toBeDefined();
  await act(async () => resolve("Systems content"));
  expect(screen.getByRole("dialog")).toBeDefined();
  expect(animate).toHaveBeenCalledWith(
    [
      { transform: "translate(-380px, -275px) scale(0.25)", opacity: 0.3 },
      { transform: "none", opacity: 1 },
    ],
    expect.objectContaining({ duration: 460 }),
  );
});
