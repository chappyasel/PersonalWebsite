// @vitest-environment jsdom
import { CoordinationGlyphPlate } from "../illustration/CoordinationGlyphPlate";
import { ABOUT_BOOT_CAMERA } from "../scene/aboutBootPerspective";
import { blinkerPlate } from "../scene/coordinationBlinkerPlate";
import { coordinationCrossing } from "../scene/coordinationCrossing";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CoordinationBlinkerPlate } from "./CoordinationBlinkerPlate";
import { HdrFill } from "./HdrFill";

function stubScreen(hdr: boolean) {
  const screen = {
    matches: hdr,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => screen);
  return screen;
}

let root: Root | null = null;

function mount(element: React.ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  act(() => {
    root = createRoot(host);
    root.render(element);
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  coordinationCrossing.setHdrBlinker(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HdrFill", () => {
  it("never loads or plays on an SDR screen", () => {
    stubScreen(false);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const video = mount(<HdrFill theme="dark" />).querySelector("video")!;
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.getAttribute("preload")).toBe("none");
    expect(play).not.toHaveBeenCalled();
  });

  it("plays the block's accent, muted from JS too, on an HDR screen", () => {
    stubScreen(true);
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();
    const video = mount(<HdrFill theme="light" />).querySelector("video")!;
    expect(video.getAttribute("src")).toBe("/hdr/accent-light.mp4");
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalledOnce();
  });

  it("shows only after the playing event", () => {
    stubScreen(true);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const video = mount(<HdrFill theme="dark" />).querySelector("video")!;
    expect(video.dataset.playing).toBeUndefined();
    act(() => void video.dispatchEvent(new Event("playing")));
    expect(video.dataset.playing).toBe("");
  });

  it("keeps the CSS block when autoplay is refused", () => {
    stubScreen(true);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException("blocked", "NotAllowedError"),
    );
    const video = mount(<HdrFill theme="dark" />).querySelector("video")!;
    expect(video.dataset.playing).toBeUndefined();
  });
});

describe("CoordinationBlinkerPlate", () => {
  const spot = { x: 300, y: 200, em: 40 };

  it("renders nothing on an SDR screen, so the frame loop writes nowhere", () => {
    stubScreen(false);
    expect(
      mount(<CoordinationBlinkerPlate theme="dark" />).querySelector(".hdr"),
    ).toBeNull();
  });

  it("leaves with the Scene Diagnostics switch", () => {
    stubScreen(true);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const host = mount(<CoordinationBlinkerPlate theme="dark" />);
    expect(host.querySelector(".hdr")).not.toBeNull();
    act(() => coordinationCrossing.setHdrBlinker(false));
    expect(host.querySelector(".hdr")).toBeNull();
  });

  it("covers the block, centred on the spot, at the shader's blink", () => {
    stubScreen(true);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const plate = mount(<CoordinationBlinkerPlate theme="dark" />)
      .firstElementChild as HTMLElement;
    blinkerPlate.place(spot, 0.25);
    expect(plate.style.width).toBe("24px");
    expect(plate.style.height).toBe("46px");
    expect(plate.style.transform).toBe("translate3d(288px, 177px, 0)");
    expect(plate.style.opacity).toBe("0.25");
  });

  it("inherits visibility, so a hidden canvas takes the plate with it", () => {
    stubScreen(true);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const plate = mount(<CoordinationBlinkerPlate theme="dark" />)
      .firstElementChild as HTMLElement;
    blinkerPlate.place(spot, 1);
    expect(plate.style.visibility).toBe("inherit");
    blinkerPlate.hide();
    expect(plate.style.visibility).toBe("hidden");
  });
});

describe("CoordinationGlyphPlate", () => {
  it("measures again when a new camera moves the block inside the same box", () => {
    stubScreen(true);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    Object.assign(Element.prototype, { getAnimations: () => [] });
    const rect = (x: number) =>
      ({ left: x, top: 50, width: 10, height: 20 }) as DOMRect;
    let blockLeft = 40;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        return this.tagName === "rect"
          ? rect(blockLeft)
          : ({ left: 0, top: 0, width: 200, height: 200 } as DOMRect);
      },
    );
    const shelf = (camera: typeof ABOUT_BOOT_CAMERA) => (
      <div>
        <svg>
          <rect className="stacks-boot-coordination-blinker-block" />
        </svg>
        <CoordinationGlyphPlate camera={camera} />
      </div>
    );
    const host = mount(shelf(ABOUT_BOOT_CAMERA));
    const plate = host.querySelector<HTMLElement>(".coordination-hdr-glyph")!;
    expect(plate.style.left).toBe("20%");

    blockLeft = 44;
    act(() => root?.render(shelf({ ...ABOUT_BOOT_CAMERA })));
    expect(plate.style.left).toBe("22%");

    Reflect.deleteProperty(Element.prototype, "getAnimations");
  });
});
