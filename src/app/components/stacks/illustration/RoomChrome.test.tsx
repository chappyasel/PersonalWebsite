// @vitest-environment jsdom
import UnitRail from "../dom/UnitRail";
import { useStacks } from "../store";
import { cleanup, render } from "@testing-library/react";
import Link from "next/link";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { RoomChrome } from "./RoomChrome";

vi.mock("~/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <button>Change theme</button>,
}));
vi.mock("../dom/ChromeLayer", () => ({
  default: () => (
    <div>
      <button>Open keyboard shortcuts</button>
      <button>Field Notes</button>
      <button>Search the site</button>
      <button>Scene Diagnostics</button>
    </div>
  ),
  ChromeSceneControls: () => (
    <div>
      <button>Change theme</button>
      <button>Mute</button>
    </div>
  ),
}));
vi.mock("../input/RoomNavigation", () => ({
  useRoomNavigation: () => () => true,
}));
afterEach(() => {
  cleanup();
  useStacks.setState(useStacks.getInitialState());
});

it("keeps theme selection while holding scene controls until actual live presentation", () => {
  const view = render(<RoomChrome illustrated live={false} />);
  const residentSound = view.getByRole("button", {
    name: "Mute",
    hidden: true,
  });
  expect(view.getByText("Chappy Asel")).not.toBeNull();
  expect(view.getByRole("button", { name: "Change theme" })).not.toBeNull();
  for (const name of [
    "Field Notes",
    "Mute",
    "Scene Diagnostics",
    "Open keyboard shortcuts",
  ])
    expect(view.queryByRole("button", { name })).toBeNull();
  view.rerender(<RoomChrome illustrated live />);
  expect(view.getByRole("button", { name: "Mute" })).toBe(residentSound);
  for (const name of [
    "Field Notes",
    "Mute",
    "Scene Diagnostics",
    "Open keyboard shortcuts",
    "Change theme",
  ])
    expect(view.getByRole("button", { name })).not.toBeNull();
  view.rerender(<RoomChrome illustrated live={false} />);
  expect(view.queryByRole("button", { name: "Mute" })).toBeNull();
  expect(view.getByRole("button", { name: "Mute", hidden: true })).toBe(
    residentSound,
  );
  expect(view.getByRole("button", { name: "Change theme" })).not.toBeNull();
});

it("retains the legacy room's existing chrome ownership", () => {
  const view = render(<RoomChrome illustrated={false} live={false} />);
  expect(
    view.getByRole("button", { name: "Scene Diagnostics" }),
  ).not.toBeNull();
});

it("keeps help and diagnostics available after deliberately choosing 2D", () => {
  const view = render(<RoomChrome illustrated live={false} keepControls />);
  expect(
    view.getByRole("button", { name: "Open keyboard shortcuts" }),
  ).not.toBeNull();
  expect(
    view.getByRole("button", { name: "Scene Diagnostics" }),
  ).not.toBeNull();
  expect(view.queryByText("Chappy Asel")).toBeNull();
});

it("tabs from the header through the desktop rail, utilities, and content, in both directions", async () => {
  const user = userEvent.setup();
  const view = render(
    <>
      <style>{`.stacks-unit-rail-mobile { display: none; }`}</style>
      <RoomChrome illustrated live>
        <UnitRail />
      </RoomChrome>
      <Link href="/books">Read more</Link>
    </>,
  );
  const labels = [
    "Open keyboard shortcuts",
    "Field Notes",
    "Search the site",
    "Scene Diagnostics",
    "About",
    "Book Notes",
    "Weightlifting",
    "Systems",
    "Projects",
    "Musings",
    "Talks",
    "Change theme",
    "Mute",
    "Read more",
  ];
  const controls = labels.map((name) =>
    view.getByRole(name === "Read more" ? "link" : "button", { name }),
  );
  for (const control of controls) {
    await user.tab();
    expect(document.activeElement).toBe(control);
  }
  for (const control of controls.slice(0, -1).reverse()) {
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(control);
  }
});

it("keeps the rail mounted and focus intact when scene controls become available", () => {
  const view = render(
    <RoomChrome illustrated live={false}>
      <UnitRail />
    </RoomChrome>,
  );
  const rail = view.container.querySelector(".stacks-unit-rail-desktop")!;
  const about = rail.querySelector("button")!;
  about.focus();
  expect(rail.closest("[inert]")).toBeNull();
  view.rerender(
    <RoomChrome illustrated live>
      <UnitRail />
    </RoomChrome>,
  );
  expect(view.container.querySelector(".stacks-unit-rail-desktop")).toBe(rail);
  expect(document.activeElement).toBe(about);
});
