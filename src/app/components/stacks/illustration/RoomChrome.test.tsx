// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { RoomChrome } from "./RoomChrome";

vi.mock("~/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <button>Change theme</button>,
}));
vi.mock("../dom/ChromeLayer", () => ({
  default: () => (
    <div>
      <button>Field Notes</button>
      <button>Mute</button>
      <button>Scene Diagnostics</button>
      <button>Open keyboard shortcuts</button>
      <button>Change theme</button>
    </div>
  ),
}));
afterEach(cleanup);

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
