// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { originReturnGeometry } from "./originZoom";
import {
  PageScrollMemory,
  measureRoomSource,
  preserveRoomJourneyOnReplace,
  readRoomJourney,
  rememberRoomSource,
  roomDirection,
  writeRoomJourney,
} from "./roomJourney";

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, "");
  vi.restoreAllMocks();
});
it("retraces major room destinations while leaving book modals and same-section changes alone", () => {
  for (const path of [
    "/books",
    "/weightlifting",
    "/systems",
    "/manual",
    "/routine",
    "/systems/planning",
    "/liarsdice",
    "/golf",
    "/weight-log",
  ]) {
    expect(roomDirection("/", path)).toBe("enter");
    expect(roomDirection(path, "/")).toBe("return");
    expect(roomDirection(path, path)).toBeNull();
  }
  for (const [from, to] of [
    ["/books", "/books/behave"],
    ["/books/behave", "/books"],
    ["/", "/books/behave"],
    ["/books", "/weightlifting"],
    ["/books", "/books"],
  ])
    expect(roomDirection(from!, to!)).toBeNull();
});
it("preserves the router and modal state and keeps each entry's own source", () => {
  const first = rememberRoomSource("books:card", 2);
  history.replaceState({ __NA: true, tree: ["router"], modal: "keep" }, "");
  writeRoomJourney(first);
  const previous: unknown = history.state;
  writeRoomJourney(rememberRoomSource("books:heading", 2));
  expect(history.state).toMatchObject({
    __NA: true,
    tree: ["router"],
    modal: "keep",
  });
  expect(readRoomJourney(previous)).toEqual(first);
  expect(readRoomJourney(history.state)?.source?.id).toBe("books:heading");
  expect(
    readRoomJourney({ __booksRoomJourney: { generation: 2, source: 4 } }),
  ).toBeNull();
});
it("remeasures a DOM source and falls back when it disappears or the room expires", () => {
  // UUIDs need no CSS escaping; jsdom does not provide CSS.escape.
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  const link = document.createElement("a");
  document.body.append(link);
  const measure = vi.spyOn(link, "getBoundingClientRect");
  measure.mockReturnValue({
    left: 100,
    top: 100,
    width: 200,
    height: 100,
  } as DOMRect);
  const journey = rememberRoomSource(link, 4);
  const project = vi.fn();
  expect(measureRoomSource(journey, 4, project)?.left).toBe(100);
  measure.mockReturnValue({
    left: 200,
    top: 200,
    width: 300,
    height: 80,
  } as DOMRect);
  expect(measureRoomSource(journey, 4, project)?.left).toBe(200);
  expect(measureRoomSource(journey, 5, project)).toBeNull();
  link.remove();
  expect(measureRoomSource(journey, 4, project)).toBeNull();
  expect(project).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("projects a remembered 3D source only in the same room generation", () => {
  const journey = rememberRoomSource("books:portal", 2);
  const rect = { left: 10, top: 30, width: 100, height: 50 };
  const project = vi.fn(() => rect);
  expect(measureRoomSource(journey, 2, project)).toEqual(rect);
  expect(project).toHaveBeenCalledWith("books:portal");
  expect(measureRoomSource(journey, 3, project)).toBeNull();
  expect(project).toHaveBeenCalledTimes(1);
  project.mockReturnValue({ ...rect, top: 10000 });
  expect(measureRoomSource(journey, 2, project)).toBeNull();
});
it("closes the full-size page clip toward the current source bounds", () => {
  expect(
    originReturnGeometry(
      { left: 100, top: 200, width: 400, height: 100 },
      1200,
      900,
    ),
  ).toEqual({
    clip: "inset(200px 700px 600px 100px round 16px)",
    transform: "none",
  });
  expect(originReturnGeometry(null, 1200, 900)).toEqual({
    clip: "inset(0px 0px 0px 0px round 0px)",
    transform: "translate(36px, 27px) scale(0.94)",
  });
});

it("keeps the entry point through Next and filter replacements, without copying it to another page", () => {
  history.replaceState({ __NA: true }, "", "/books");
  const dispose = preserveRoomJourneyOnReplace();
  const journey = rememberRoomSource("books:card", 2);
  try {
    writeRoomJourney(journey);
    history.replaceState({ __NA: true, routerTree: "new tree" }, "", "/books");
    expect(readRoomJourney(history.state)).toEqual(journey);
    history.replaceState(null, "", "/books?search=behave");
    expect(readRoomJourney(history.state)).toEqual(journey);
    history.replaceState({ modal: true }, "", "/books/behave");
    expect(readRoomJourney(history.state)).toBeNull();
    expect(history.state).toEqual({ modal: true });
  } finally {
    dispose();
  }
});

it("stops preserving state on disable, even underneath a later wrapper", () => {
  history.replaceState(null, "", "/books");
  const original = history.replaceState.bind(history);
  const dispose = preserveRoomJourneyOnReplace();
  writeRoomJourney(rememberRoomSource("books:card", 2));
  const wrapped = history.replaceState.bind(history);
  const later: History["replaceState"] = (data: unknown, title, url) =>
    wrapped(data, title, url);
  history.replaceState = later;
  dispose();
  expect(history.replaceState === later).toBe(true);
  history.replaceState(null, "", "/books");
  expect(readRoomJourney(history.state)).toBeNull();
  history.replaceState = original;
});

it("keeps reading positions separate for repeated visits through the same card", () => {
  const memory = new PageScrollMemory();
  const first = rememberRoomSource("books:card", 2);
  const second = rememberRoomSource("books:card", 2);
  memory.save(first, 0, 800);
  memory.save(second, 0, 1400);
  expect(memory.get(first)).toEqual({ left: 0, top: 800 });
  expect(memory.get(second)).toEqual({ left: 0, top: 1400 });
  for (let i = 0; i < 64; i++)
    memory.save(rememberRoomSource("books:card", 2), 0, i);
  expect(memory.get(first)).toBeUndefined();
  expect(memory.get(null)).toBeUndefined();
});

it.each(["/weightlifting", "/systems", "/manual", "/routine"])(
  "preserves %s entry sources through filter replacements",
  (path) => {
    history.replaceState({ __NA: true }, "", path);
    const dispose = preserveRoomJourneyOnReplace();
    const journey = rememberRoomSource("room:portal", 2);
    try {
      writeRoomJourney(journey);
      history.replaceState({ __NA: true }, "", `${path}?year=2025`);
      expect(readRoomJourney(history.state)).toEqual(journey);
      history.replaceState({ __NA: true }, "", "/books");
      expect(readRoomJourney(history.state)).toBeNull();
    } finally {
      dispose();
    }
  },
);
