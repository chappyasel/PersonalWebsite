// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { IllustrationStage } from "./IllustrationStage";
import RoomBootShell from "./RoomBootShell";
import { getRoomArtwork } from "./artwork/getRoomArtwork";

vi.mock("../dom/BootScreen", () => ({
  default: () => <div data-legacy-boot="" />,
  BootScreenArtwork: () => <svg data-about-artwork="" />,
}));

function markup(element: React.ReactElement) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(element);
  return root;
}

it.each([1, 2, 3, 4, 5, 6])(
  "gives shelf %i one background with the same variant sizes as the hydrated artwork",
  (unitIndex) => {
    const shell = markup(<RoomBootShell unitIndex={unitIndex} illustrated />);
    const stage = shell.querySelector<HTMLElement>(".room-illustration-stage")!;
    expect(shell.querySelectorAll('[role="img"]')).toHaveLength(1);
    expect(shell.querySelector("img, picture, link[rel=preload]")).toBeNull();
    expect(shell.querySelector("[data-room-artwork]")).toBeNull();
    for (const theme of ["light", "dark"] as const) {
      for (const viewport of ["desktop", "phone"] as const) {
        const asset = getRoomArtwork(unitIndex, theme, viewport)!;
        const prefix = `--room-first-paint-${theme}-${viewport}`;
        expect(stage.style.getPropertyValue(`${prefix}-image`)).toBe(
          `url("${asset.src}")`,
        );
        const hydrated = markup(
          <IllustrationStage
            unitIndex={unitIndex}
            theme={theme}
            viewport={viewport}
          />,
        );
        const hydratedStage = hydrated.querySelector<HTMLElement>(
          ".room-illustration-stage",
        )!;
        expect(stage.style.getPropertyValue(`${prefix}-width`)).toBe(
          hydratedStage.style.getPropertyValue(
            `--room-artwork-${viewport}-width`,
          ),
        );
        const source = hydrated.querySelector("source")!;
        expect(Number(stage.style.getPropertyValue(`${prefix}-ratio`))).toBe(
          Number(source.getAttribute("width")) /
            Number(source.getAttribute("height")),
        );
      }
    }
  },
);

it("retains About's class-aware SVG and the legacy opt-out", () => {
  const about = markup(<RoomBootShell unitIndex={0} illustrated />);
  expect(about.querySelectorAll("[data-about-artwork]")).toHaveLength(1);
  expect(about.querySelector(".room-first-paint-artwork")).toBeNull();
  const legacy = markup(<RoomBootShell unitIndex={1.52} illustrated={false} />);
  expect(legacy.querySelector("[data-legacy-boot]")).not.toBeNull();
  expect(legacy.querySelector(".room-first-paint")).toBeNull();
});

it("selects background variants from the established theme class and viewport", () => {
  const styles = readFileSync(
    "src/app/components/stacks/illustration/roomBootShell.css",
    "utf8",
  );
  expect(styles).toContain("html.dark .room-first-paint-artwork");
  expect(styles).toContain("@media (max-width: 599px)");
  expect(styles).not.toContain("prefers-color-scheme");
  // Only the selected custom property becomes an image request. The other
  // variant URLs remain inert values until their class/media rule applies.
  expect(styles.match(/background-image:/g)).toHaveLength(1);
  expect(styles).toContain("background-image: var(--room-first-paint-image)");
  for (const theme of ["light", "dark"])
    for (const viewport of ["desktop", "phone"])
      expect(styles).toContain(
        `--room-first-paint-image: var(--room-first-paint-${theme}-${viewport}-image)`,
      );
});

it("keeps theme resolution out of the server request and forwards route boot ownership", () => {
  const page = readFileSync("src/app/RoomHomePage.tsx", "utf8");
  const shell = readFileSync(
    "src/app/components/stacks/illustration/RoomBootShell.tsx",
    "utf8",
  );
  expect(page).not.toContain('from "next/headers"');
  expect(page).not.toContain("cookies()");
  expect(page).toContain("<StacksHome illustrated={illustrated}");
  // data.ts imports client icon contexts and cannot enter the server shell.
  expect(shell).not.toContain('from "../data"');
});
