// @vitest-environment jsdom
import type { SystemsLayer } from "../types";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SECTION_JUMP_EVENT } from "~/components/daylight/sectionJump";

import LayerSections from "./LayerSections";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

const layers: SystemsLayer[] = [
  "Foundations",
  "Direction & Strategy",
  "Execution Systems",
].map((title, i) => ({
  id: title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-$/, ""),
  number: i + 1,
  title,
  icon: "🧱",
  blocks: [
    { type: "paragraph", content: [{ text: `${title} body` }] },
    {
      type: "toggle",
      title: [
        { text: `${title} dropdown`, bold: true },
        { text: " → summary" },
      ],
      children: [{ type: "paragraph", content: [{ text: "nested" }] }],
    },
  ],
}));

/** jsdom has no matchMedia; `wide` is what `(min-width: 640px)` reports. */
function mockViewport(wide: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: wide,
    media: "(min-width: 640px)",
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn(() => query) as unknown as typeof window.matchMedia;
  return {
    resize(next: boolean) {
      query.matches = next;
      for (const fn of listeners) fn();
    },
  };
}

/** The layer's own header row, by section id; the dropdowns inside the
 * body are buttons too, so a name query would match both. */
const header = (id: string) =>
  document.getElementById(id)!.querySelector<HTMLElement>('[role="button"]')!;
const expanded = (id: string) =>
  header(id).getAttribute("aria-expanded") === "true";
const foldState = (id: string) =>
  document
    .getElementById(id)!
    .querySelector("[data-systems-fold]")!
    .getAttribute("data-open");

describe("LayerSections", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/systems");
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
  });

  afterEach(() => {
    // No `globals: true` in vitest.config, so Testing Library does not
    // unmount on its own; a stale render would answer the id lookups.
    cleanup();
    vi.useRealTimers();
  });

  it("renders every layer folded-by-stylesheet on the server, so width decides", () => {
    const markup = renderToStaticMarkup(<LayerSections layers={layers} />);
    expect(markup.match(/data-open="auto"/g)).toHaveLength(3);
    // The bodies are in the HTML at every width; only the fold hides them.
    expect(markup).toContain("Execution Systems body");
  });

  it("uses compact toggle rows and an icon for the summary separator", () => {
    const markup = renderToStaticMarkup(<LayerSections layers={layers} />);

    expect(markup).toContain("dl-prose");
    expect(markup).toContain("data-notion-toggle-arrow");
    expect(markup).toContain("pl-6");
    expect(markup).not.toContain("→ summary");
    expect(markup).not.toMatch(
      /data-notion-toggle-trigger[^>]*class="[^"]*-ml-1/,
    );
  });

  it("uses single-digit layer numbers and indents their contents", () => {
    mockViewport(false);
    const { container } = render(<LayerSections layers={layers} />);
    const numbers = Array.from(
      container.querySelectorAll<HTMLElement>("[data-systems-layer-number]"),
    );
    const body = container.querySelector<HTMLElement>(
      "[data-systems-layer-body]",
    );
    const title = container.querySelector<HTMLElement>(
      "[data-systems-layer-title]",
    );

    expect(numbers.map((number) => number.textContent)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(numbers[0]?.className).toContain("w-3");
    expect(numbers[0]?.className).toContain("font-serif");
    expect(numbers[0]?.className).toContain("text-sm");
    expect(numbers[0]?.className).not.toContain("font-mono");
    expect(numbers[0]?.parentElement?.className).toContain("gap-1.5");
    expect(body?.className).toContain("pl-1");
    expect(body?.className).not.toContain(
      "[&_[data-notion-toggle-trigger]]:text-base",
    );
    expect(title?.className).toContain("text-[1.375rem]");
  });

  it("uses the nested dropdown caret size and color for layer headers", () => {
    mockViewport(false);
    const { container } = render(<LayerSections layers={layers} />);
    const layerCaret = container.querySelector<SVGElement>(
      "[data-systems-caret]",
    );
    const nestedCaret = container.querySelector<SVGElement>(
      "[data-notion-toggle-trigger] svg",
    );

    expect(layerCaret?.getAttribute("width")).toBe("14");
    expect(nestedCaret?.getAttribute("width")).toBe("14");
    expect(layerCaret?.parentElement?.className).toContain(
      "text-muted-foreground/80",
    );
    expect(nestedCaret?.parentElement?.className).toContain(
      "text-muted-foreground/80",
    );
    expect(layerCaret?.parentElement?.className).toContain(
      "group-hover/sec:text-foreground",
    );
    expect(nestedCaret?.parentElement?.className).toContain(
      "group-hover/notion-toggle:text-foreground",
    );
  });

  it("is an accordion on a phone: one layer open at a time", () => {
    mockViewport(false);
    render(<LayerSections layers={layers} />);

    expect(layers.map((l) => expanded(l.id))).toEqual([false, false, false]);

    fireEvent.click(header("foundations"));
    expect(expanded("foundations")).toBe(true);
    expect(foldState("foundations")).toBe("true");

    fireEvent.click(header("direction-strategy"));
    expect(expanded("direction-strategy")).toBe(true);
    // Opening a second layer folds the first back to its width default.
    expect(expanded("foundations")).toBe(false);
    expect(foldState("foundations")).toBe("auto");

    fireEvent.click(header("direction-strategy"));
    expect(expanded("direction-strategy")).toBe(false);
  });

  it("opens every layer from sm up and lets each fold on its own", () => {
    mockViewport(true);
    render(<LayerSections layers={layers} />);

    expect(layers.map((l) => expanded(l.id))).toEqual([true, true, true]);
    expect(foldState("foundations")).toBe("auto");

    fireEvent.click(header("foundations"));
    expect(expanded("foundations")).toBe(false);
    expect(foldState("foundations")).toBe("false");
    expect(expanded("direction-strategy")).toBe(true);
    expect(expanded("execution-systems")).toBe(true);
  });

  it("opens the deep-linked layer on load and scrolls to it", () => {
    mockViewport(false);
    window.history.replaceState(null, "", "/systems#execution-systems");
    render(<LayerSections layers={layers} />);

    expect(expanded("execution-systems")).toBe(true);
    expect(expanded("foundations")).toBe(false);
    act(() => {
      vi.runAllTimers();
    });
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.instances.at(-1)).toBe(
      document.getElementById("execution-systems"),
    );
  });

  it("follows a later hash change and an in-page section jump", () => {
    mockViewport(false);
    render(<LayerSections layers={layers} />);

    act(() => {
      window.location.hash = "#direction-strategy";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(expanded("direction-strategy")).toBe(true);

    // An At a Glance title link replaces the hash (no hashchange) and fires the
    // jump event instead.
    act(() => {
      window.history.replaceState(null, "", "#foundations");
      window.dispatchEvent(
        new CustomEvent(SECTION_JUMP_EVENT, { detail: { id: "foundations" } }),
      );
    });
    expect(expanded("foundations")).toBe(true);
    expect(expanded("direction-strategy")).toBe(false);
  });

  it("drops the deep-link hash when a layer is toggled by hand", () => {
    mockViewport(false);
    window.history.replaceState(null, "", "/systems#foundations");
    render(<LayerSections layers={layers} />);
    expect(expanded("foundations")).toBe(true);

    fireEvent.click(header("foundations"));
    expect(expanded("foundations")).toBe(false);
    expect(window.location.hash).toBe("");
  });

  it("keeps a keyboard path: Enter and Space toggle the header", () => {
    mockViewport(false);
    render(<LayerSections layers={layers} />);

    fireEvent.keyDown(header("foundations"), { key: "Enter" });
    expect(expanded("foundations")).toBe(true);
    fireEvent.keyDown(header("foundations"), { key: " " });
    expect(expanded("foundations")).toBe(false);
  });

  it("re-reads the width when the viewport crosses the breakpoint", () => {
    const viewport = mockViewport(false);
    render(<LayerSections layers={layers} />);
    expect(expanded("foundations")).toBe(false);

    act(() => viewport.resize(true));
    expect(expanded("foundations")).toBe(true);
  });
});
