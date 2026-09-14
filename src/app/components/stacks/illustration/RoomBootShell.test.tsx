// @vitest-environment jsdom
import { WORLD_BOOT_POLICY } from "../boot/worldBootPolicy";
import ChromeKeyboardHelp from "../dom/ChromeKeyboardHelp";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { IllustrationStage } from "./IllustrationStage";
import RoomBootShell from "./RoomBootShell";
import { getRoomArtwork } from "./artwork/getRoomArtwork";
import shelves from "./artwork/shelves.generated.json";

vi.mock("../dom/BootScreen", () => ({
  default: () => <div data-legacy-boot="" />,
  BootScreenArtwork: () => <svg data-about-artwork="" />,
}));

function markup(element: React.ReactElement) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(element);
  return root;
}

it("shows the server loading status only until hydration owns an active 3D load", () => {
  const root = markup(<RoomBootShell unitIndex={4} illustrated />);
  const style = document.createElement("style");
  // Exercise either bundle order: generic action styling must not unhide it.
  style.textContent = ["roomBootShell.css", "illustratedRoom.css"]
    .map((file) =>
      readFileSync(`src/app/components/stacks/illustration/${file}`, "utf8"),
    )
    .join("\n");
  const html = document.documentElement;
  const attributes = ["data-room-view", "data-world", "data-illustrated-ui"];
  const previous = attributes.map((name) => html.getAttribute(name));
  document.head.append(style);
  document.body.append(root);
  try {
    const status = root.querySelector(".room-first-paint-status")!;
    expect(status.querySelector('[role="status"]')?.textContent).toBe(
      "Loading the 3D room...",
    );
    expect(status.querySelectorAll(".stacks-boot-wait-dot")).toHaveLength(3);
    expect(status.querySelector('[data-boot-note="active"]')?.textContent).toBe(
      "Waiting for first light.",
    );
    html.setAttribute("data-room-view", "illustrated");
    html.removeAttribute("data-illustrated-ui");
    for (const phase of ["pending", "warm"]) {
      html.setAttribute("data-world", phase);
      expect(getComputedStyle(status).display).toBe("flex");
    }
    html.setAttribute("data-illustrated-ui", "ready");
    expect(getComputedStyle(status).display).toBe("none");
    html.removeAttribute("data-illustrated-ui");
    html.removeAttribute("data-world");
    expect(getComputedStyle(status).display).toBe("none");
    html.setAttribute("data-room-view", "live");
    expect(getComputedStyle(status).display).toBe("none");
  } finally {
    root.remove();
    style.remove();
    attributes.forEach((name, index) => {
      const value = previous[index];
      if (value == null) html.removeAttribute(name);
      else html.setAttribute(name, value);
    });
  }
});

it("uses the boot policy's dissolve clock for both artwork and chrome", () => {
  const shell = markup(<RoomBootShell unitIndex={1} illustrated />);
  expect(
    Array.from(
      shell.querySelectorAll("style"),
      (style) => style.textContent,
    ).join("\n"),
  ).toContain(
    `--room-dissolve-duration:${WORLD_BOOT_POLICY.illustrationDissolveMs}ms`,
  );
  const styles = readFileSync(
    "src/app/components/stacks/illustration/roomBootShell.css",
    "utf8",
  );
  for (const property of [
    "opacity",
    "--room-chrome-ink",
    "--room-chrome-shadow",
  ])
    expect(styles).toContain(
      `${property} var(--room-dissolve-duration, 160ms) linear`,
    );
  expect(styles).toContain("--room-chrome-shadow: transparent;");
});

it("hands the boot name to a live label with identical text and position metrics", () => {
  const style = document.createElement("style");
  style.textContent = readFileSync(
    "src/app/components/stacks/illustration/roomBootShell.css",
    "utf8",
  );
  const root = markup(
    <>
      <RoomBootShell unitIndex={1} illustrated />
      <div className="stacks-world-shell" data-illustrated-entry="">
        <div className="stacks-wordmark">
          <ChromeKeyboardHelp
            open={false}
            onOpenChange={() => undefined}
            tapFirst={false}
            fieldNotes={<button style={{ height: 36 }}>Field Notes</button>}
          />
        </div>
      </div>
    </>,
  );
  document.head.append(style);
  document.body.append(root);
  try {
    const boot = getComputedStyle(root.querySelector(".room-entry-wordmark")!);
    const live = getComputedStyle(root.querySelector(".room-wordmark-label")!);
    const position = getComputedStyle(root.querySelector(".stacks-wordmark")!);
    for (const property of [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
    ] as const)
      expect(live[property], property).toBe(boot[property]);
    expect(position.top).toBe(boot.top);
    expect(position.left).toBe(boot.left);
  } finally {
    root.remove();
    style.remove();
  }
});

it("inlines all 24 empty variants without prop textures or a network request", () => {
  for (const [key, uri] of Object.entries(shelves)) {
    const [index, variant] = key.split("/");
    const [theme, viewport] = variant!.split("-");
    const asset = getRoomArtwork(
      Number(index),
      theme as "light" | "dark",
      viewport as "desktop" | "phone",
    )!;
    const svg = Buffer.from(uri.split(",")[1]!, "base64").toString();
    expect(svg).toBe(readFileSync(`public${asset.shelfSrc}`, "utf8"));
    expect(svg).not.toMatch(/<image|<script|https?:\/\/(?!www.w3.org)/);
  }
});

it.each([1, 2, 3, 4, 5, 6])(
  "embeds shelf %i alongside all the other angles with matching hydrated dimensions",
  (unitIndex) => {
    const shell = markup(<RoomBootShell unitIndex={unitIndex} illustrated />);
    const stage = shell.querySelector<HTMLElement>(
      `[data-first-paint-unit="${unitIndex}"] .room-illustration-stage`,
    )!;
    expect(shell.querySelectorAll("[data-first-paint-unit]")).toHaveLength(8);
    expect(shell.querySelector("img, picture, link[rel=preload]")).toBeNull();
    expect(shell.querySelector("[data-room-artwork]")).toBeNull();
    for (const theme of ["light", "dark"] as const) {
      for (const viewport of ["desktop", "phone"] as const) {
        const prefix = `--room-first-paint-${theme}-${viewport}`;
        expect(stage.style.getPropertyValue(`${prefix}-image`)).toBe(
          `var(--room-shelf-${unitIndex}-${theme}-${viewport})`,
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

it("keeps the pre-paint geometry in the server shell and drops it once hydrated", () => {
  const shell = markup(<RoomBootShell unitIndex={4} illustrated />);
  // Nothing has run React yet in the shell, so the frames carry their geometry
  // as source. Golf owns its own stage and never takes a frame.
  const scripts = Array.from(
    shell.querySelectorAll(".room-illustration-stage script"),
    (script) => script.textContent ?? "",
  );
  expect(scripts).toHaveLength(7);
  for (const script of scripts)
    expect(script).toContain("--room-frame-");
  // The unit selection script still runs ahead of any shelf markup.
  expect(shell.querySelector("script")?.textContent).toContain(
    "data-room-first-unit",
  );
  // About's frame additionally patches its plank and support faces in place.
  const about = shell.querySelector(
    '[data-first-paint-unit="0"] .room-illustration-stage script',
  )!.textContent!;
  expect(about).toContain("data-boot-plank-top");
  expect(about).toContain("data-boot-plank-side");
  expect(about).toContain("data-boot-support-");

  // The hydrated stage computes the same variables in its layout effect, so
  // shipping the source a second time buys nothing.
  for (const unitIndex of [0, 4])
    expect(
      markup(<IllustrationStage unitIndex={unitIndex} />).querySelector(
        "script",
      ),
    ).toBeNull();
  // Face patching belongs to the script, and follows it out of the hydrated tree.
  expect(
    markup(<IllustrationStage unitIndex={0} shelfOnly />).querySelector(
      "script",
    ),
  ).toBeNull();
});

it("retains About's class-aware SVG and the legacy opt-out", () => {
  const about = markup(<RoomBootShell unitIndex={0} illustrated />);
  expect(about.querySelectorAll("[data-about-artwork]")).toHaveLength(1);
  expect(about.querySelectorAll(".room-first-paint-artwork")).toHaveLength(6);
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
  expect(styles).toContain(
    "@media (max-width: 1199.999px) and (max-aspect-ratio: 3/4)",
  );
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
  expect(page).toContain("<StacksHome data={data}");
  // data.ts imports client icon contexts and cannot enter the server shell.
  expect(shell).not.toContain('from "../data"');
});
