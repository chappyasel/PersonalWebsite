// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SectionLink from "./SectionLink";

describe("SectionLink", () => {
  let scrollIntoView = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = `<section id="feedback"></section>`;
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
    }) as unknown as typeof window.matchMedia;
    window.history.replaceState(null, "", "/manual");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("is a plain anchor to the fragment", () => {
    const { getByRole } = render(
      <SectionLink id="feedback">Feedback</SectionLink>,
    );
    expect(getByRole("link").getAttribute("href")).toBe("#feedback");
  });

  it("jumps in place on a plain click, without a navigation", () => {
    const { getByRole } = render(
      <SectionLink id="feedback">Feedback</SectionLink>,
    );
    const prevented = !fireEvent.click(getByRole("link"));
    expect(prevented).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("#feedback");
  });

  it("leaves modified clicks to the browser", () => {
    const { getByRole } = render(
      <SectionLink id="feedback">Feedback</SectionLink>,
    );
    const prevented = !fireEvent.click(getByRole("link"), { metaKey: true });
    expect(prevented).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("falls through when the section is not on the page", () => {
    const { getByRole } = render(<SectionLink id="missing">Gone</SectionLink>);
    const prevented = !fireEvent.click(getByRole("link"));
    expect(prevented).toBe(false);
  });
});
