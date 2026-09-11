// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NotionToggle from "~/components/notion/NotionToggle";

import AnchorLink from "./AnchorLink";
import DaylightSection from "./DaylightSection";

vi.mock("~/lib/analytics", () => ({ capture: vi.fn(), captureOnce: vi.fn() }));
vi.mock("~/components/site/SitePageHoverCard", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const writeText = vi.fn().mockResolvedValue(undefined);
const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockClear();
  window.history.replaceState(null, "", "/systems");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
});

describe("section copy buttons", () => {
  it("hides copy links on touch and limits their reveal to mouse input", async () => {
    const view = render(<AnchorLink id="foundations" className="inline-flex" />);
    const button = view.getByRole("button", {
      name: "Copy link to this section",
    });
    // Compile the rendered classes: jsdom cannot reproduce Safari withholding
    // a click when an emulated hover reveals content. Guard that CSS trigger.
    const css = await postcss([
      tailwindcss({
        content: [{ raw: button.outerHTML, extension: "html" }],
        corePlugins: { preflight: false },
      }),
    ]).process("@tailwind utilities;", { from: undefined });
    let desktopHidden = false;
    let touchHidden = false;
    css.root.walkRules((rule) => {
      if (
        rule.nodes.some(
          (node) =>
            node.type === "decl" &&
            node.prop === "display" &&
            node.value === "none",
        )
      ) {
        expect(rule.parent).toMatchObject({
          type: "atrule",
          name: "media",
          params: "not all and (hover:hover) and (pointer:fine)",
        });
        touchHidden = true;
      }
      const hidesButton = rule.nodes.some(
        (node) =>
          node.type === "decl" &&
          node.prop === "opacity" &&
          node.value === "0",
      );
      if (!hidesButton && !/(?<!\\):hover\b/.test(rule.selector)) return;
      expect(rule.parent).toMatchObject({
        type: "atrule",
        name: "media",
        params: "(hover:hover) and (pointer:fine)",
      });
      if (hidesButton) desktopHidden = true;
    });
    expect(desktopHidden).toBe(true);
    expect(touchHidden).toBe(true);
  });

  it("copies the section selection while keeping address-bar navigation as an anchor", async () => {
    const view = render(<AnchorLink id="deep-think-weeks" />);
    await act(async () =>
      fireEvent.click(
        view.getByRole("button", { name: "Copy link to this section" }),
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/systems?section=deep-think-weeks#deep-think-weeks`,
    );
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#deep-think-weeks");
  });

  it("uses a book modal's canonical URL without changing the background location", async () => {
    const view = render(
      <AnchorLink id="chapter-2" url="https://books.chappyasel.com/example" />,
    );
    await act(async () =>
      fireEvent.click(
        view.getByRole("button", { name: "Copy link to this section" }),
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      "https://books.chappyasel.com/example#chapter-2",
    );
    expect(window.location.hash).toBe("");
  });

  it("copies a collapsed subsection without toggling it or nesting buttons", async () => {
    const view = render(
      <NotionToggle
        id="deep-think-weeks"
        title={[{ text: "Deep Think Weeks" }]}
        blocks={[]}
      />,
    );
    const trigger = view.getByRole("button", { name: "Deep Think Weeks" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(view.container.querySelector("button button")).toBeNull();
    await act(async () =>
      fireEvent.click(
        view.getByRole("button", { name: "Copy link to this section" }),
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("?section=deep-think-weeks#deep-think-weeks"),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps keyboard copy activation from toggling the containing section", async () => {
    const view = render(
      <DaylightSection id="foundations" title="Foundations">
        Body
      </DaylightSection>,
    );
    const copy = view.getByRole("button", {
      name: "Copy link to this section",
    });
    const header = view.getByRole("button", { name: /Foundations/ });
    copy.focus();
    fireEvent.keyDown(copy, { key: "Enter" });
    await act(async () => fireEvent.click(copy));
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("?section=foundations#foundations"),
    );
  });

  it("opens the subsection when arriving on a copied URL", () => {
    window.history.replaceState(
      null,
      "",
      "/systems?section=deep-think-weeks#deep-think-weeks",
    );
    const view = render(
      <NotionToggle
        id="deep-think-weeks"
        title={[{ text: "Deep Think Weeks" }]}
        blocks={[]}
      />,
    );
    expect(
      view
        .getByRole("button", { name: "Deep Think Weeks" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
