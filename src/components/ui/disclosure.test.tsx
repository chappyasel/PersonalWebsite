import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisclosureCaret, DisclosurePanel } from "./disclosure";

describe("Disclosure", () => {
  it("animates one unclipped caret between closed and open", () => {
    const closed = renderToStaticMarkup(<DisclosureCaret open={false} />);
    const open = renderToStaticMarkup(<DisclosureCaret open />);
    const closedPath = /<path d="([^"]+)"/.exec(closed)?.[1];
    const openPath = /<path d="([^"]+)"/.exec(open)?.[1];

    expect(closed).toContain('aria-hidden="true"');
    expect(closed).toContain("<svg");
    expect(closed).toContain('width="14"');
    expect(closed).toContain("text-muted-foreground/80");
    expect(closed).toContain("hover:text-foreground");
    expect(closed).not.toContain("rotate-90");
    expect(open).toContain("rotate-90");
    expect(open).toContain("transition-transform");
    expect(openPath).toBe(closedPath);
    expect(open).toMatch(/<svg[^>]*class="[^"]*overflow-visible/);
  });

  it("puts extra props on the glyph, the element that rotates", () => {
    const markup = renderToStaticMarkup(
      <DisclosureCaret open={false} data-routine-caret className="ml-auto" />,
    );

    expect(markup).toMatch(/<svg[^>]*data-routine-caret="true"/);
    expect(markup).toMatch(/<span[^>]*class="[^"]*ml-auto/);
  });

  it("keeps a closed panel in the markup but out of reach", () => {
    const closed = renderToStaticMarkup(
      <DisclosurePanel open={false} id="p">
        body
      </DisclosurePanel>,
    );
    const open = renderToStaticMarkup(
      <DisclosurePanel open id="p">
        body
      </DisclosurePanel>,
    );

    expect(closed).toContain("body");
    expect(closed).toContain('aria-hidden="true"');
    expect(closed).toContain('inert=""');
    expect(closed).toMatch(/height:\s*0/);
    expect(open).not.toContain("inert");
    expect(open).toMatch(/opacity:\s*1/);
  });
});
