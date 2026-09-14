import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RoomArtworkImage } from "./RoomArtworkImage";
import { getRoomArtwork } from "./getRoomArtwork";

describe("room artwork SSR contract", () => {
  it("offers only the selected shelf and uses media selection without client state", () => {
    const html = renderToStaticMarkup(
      <RoomArtworkImage unitIndex={6} alt="Talks" />,
    );
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("max-aspect-ratio: 3/4");
    expect(html).toContain("/talks/light-desktop.svg");
    expect(html).not.toMatch(
      /\/(books|projects|weightlifting|systems|musings)\//,
    );
    expect(html).not.toContain("<script");
  });
  it("fetches the shelf in view first and defers the ones travel keeps mounted", () => {
    const active = renderToStaticMarkup(
      <RoomArtworkImage unitIndex={6} alt="Talks" />,
    );
    // React spells the prop as it is written; HTML attribute names are
    // case-insensitive, so the browser still reads `fetchpriority`.
    expect(active).toContain('loading="eager"');
    expect(active).toContain('fetchPriority="high"');
    const offscreen = renderToStaticMarkup(
      <RoomArtworkImage unitIndex={6} alt="Talks" active={false} />,
    );
    expect(offscreen).toContain('loading="lazy"');
    expect(offscreen).toContain('fetchPriority="low"');
    // A hoisted preload would undo the deferral. React withholds one for a
    // lazy image, and withholds it inside <picture> either way.
    expect(offscreen).not.toContain("rel=\"preload\"");
    expect(active).not.toContain("rel=\"preload\"");
    // Both states decode off the main thread; only the queue position differs.
    for (const html of [active, offscreen])
      expect(html).toContain('decoding="async"');
  });
  it("honors explicit theme/size and leaves About and fractional destinations to their owners", () => {
    const html = renderToStaticMarkup(
      <RoomArtworkImage
        unitIndex={2}
        theme="dark"
        viewport="phone"
        alt="Weightlifting"
      />,
    );
    expect(html).toContain("/weightlifting/dark-phone.svg");
    expect(html).not.toContain("light-");
    expect(getRoomArtwork(0, "light", "desktop")).toBeNull();
    expect(getRoomArtwork(1.5, "light", "desktop")).toBeNull();
    expect(getRoomArtwork(4, "dark", "phone")?.camera.projection).toHaveLength(
      16,
    );
  });
});
