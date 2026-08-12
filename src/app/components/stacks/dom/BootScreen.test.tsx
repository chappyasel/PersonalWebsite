import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BootScreen from "./BootScreen";

describe("Stacks entrance", () => {
  it("presents Chappy's name rather than a product or loading label", () => {
    const markup = renderToStaticMarkup(<BootScreen />);

    expect(markup).toContain("Chappy Asel");
    expect(markup).not.toContain("The Stacks");
    expect(markup).not.toMatch(/progress|loading|status/i);
  });

  it("keeps the decorative entrance out of the accessibility tree", () => {
    const markup = renderToStaticMarkup(<BootScreen />);

    expect(markup).toContain('class="stacks-boot" aria-hidden="true"');
    expect(markup.match(/data-shelf=/g)).toHaveLength(3);
    expect(markup.match(/data-book=/g)).toHaveLength(21);
  });

  it("assigns every book a deterministic time-cadence slot", () => {
    const markup = renderToStaticMarkup(<BootScreen />);

    for (let index = 0; index < 21; index += 1) {
      const delay = (0.3 + index * 0.3).toFixed(1);
      expect(markup).toContain(`--book-delay:${delay}s`);
    }
  });
});
