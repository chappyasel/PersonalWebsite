// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SECTION_JUMP_EVENT, jumpToSection } from "./sectionJump";

/**
 * A section jump scrolls and replaces the hash. It must never route (the
 * root-level interceptors re-present the page in a sheet for a navigation
 * to its own path) and must never push (a pushed hash entry meant the
 * sheet's first Escape only dropped the hash).
 */
describe("jumpToSection", () => {
  let reduceMotion = false;
  let scrollIntoView = vi.fn();

  beforeEach(() => {
    reduceMotion = false;
    document.body.innerHTML = `<section id="caffeine"></section>`;
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce") && reduceMotion,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    window.history.replaceState(null, "", "/routine");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls the section into view and reflects it in the URL", () => {
    const length = window.history.length;
    expect(jumpToSection("caffeine")).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(window.location.hash).toBe("#caffeine");
    expect(window.history.length).toBe(length);
  });

  it("honours reduced motion", () => {
    reduceMotion = true;
    jumpToSection("caffeine");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });

  it("keeps foreign history state and drops Next's own keys", () => {
    window.history.replaceState(
      { stacksPanel: true, __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [] },
      "",
      "/routine",
    );
    jumpToSection("caffeine");
    expect(window.history.state).toEqual({ stacksPanel: true });
  });

  it("tells collapsible sections a jump happened", () => {
    const seen: string[] = [];
    const listen = (event: Event) =>
      seen.push((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener(SECTION_JUMP_EVENT, listen);
    jumpToSection("caffeine");
    window.removeEventListener(SECTION_JUMP_EVENT, listen);
    expect(seen).toEqual(["caffeine"]);
  });

  it("does nothing for a section that is not on the page", () => {
    expect(jumpToSection("missing")).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });
});
