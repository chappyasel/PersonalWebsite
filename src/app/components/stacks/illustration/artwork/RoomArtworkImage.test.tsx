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
    expect(html).toContain("max-width: 599px");
    expect(html).toContain("/talks/light-desktop.svg");
    expect(html).not.toMatch(
      /\/(books|projects|weightlifting|systems|musings)\//,
    );
    expect(html).not.toContain("<script");
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
