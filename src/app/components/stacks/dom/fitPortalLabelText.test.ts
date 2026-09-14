// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { fitPortalLabelText } from "./fitPortalLabelText";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it.each([1, 0.96])("fits wrapped text during entrance scale %s", (scale) => {
  const text = document.createElement("span");
  text.innerHTML = "<span>Title</span><span>Wrapped detail</span>";
  document.body.append(text);
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    width: "200px",
  } as CSSStyleDeclaration);
  vi.spyOn(text, "getBoundingClientRect").mockReturnValue({
    width: 200 * scale,
  } as DOMRect);
  const range = document.createRange();
  const measure = vi.fn()
    .mockReturnValueOnce([{ width: 100 * scale }])
    .mockReturnValueOnce([{ width: 160 * scale }, { width: 90 * scale }]);
  Object.defineProperty(range, "getClientRects", { value: measure });
  vi.spyOn(document, "createRange").mockReturnValue(range);

  fitPortalLabelText(text);

  expect(text.style.width).toBe("161px");
  expect(measure).toHaveBeenCalledTimes(2);
});

it("leaves unmeasurable text at its natural width", () => {
  const text = document.createElement("span");
  document.body.append(text);
  fitPortalLabelText(text);
  expect(text.style.width).toBe("");
});
