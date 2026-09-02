// @vitest-environment jsdom
import * as Dialog from "@radix-ui/react-dialog";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "~/components/ui/tooltip";

import FieldNotesChrome, {
  CompactAlbum,
  PostageStamp,
} from "./FieldNotesChrome";
import { FIELD_NOTE_BY_ID } from "./catalog";
import {
  FIELD_NOTE_OVERVIEW_PLACEMENT_STORAGE_KEY,
  FIELD_NOTE_PLACEMENT_STORAGE_KEY,
  resetFieldNotePlacements,
} from "./placement";
import {
  EMPTY_FIELD_NOTES_PROGRESS,
  FIELD_NOTES_STORAGE_KEY,
  type FieldNotesProgress,
  recordFieldNoteEvent,
  resetFieldNotes,
} from "./progress";

function earnFindingBeforeMount() {
  recordFieldNoteEvent({ type: "photo-mode-entered" });
}

function touchPointer(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
  });
  return event;
}

function domRect(x: number, y: number, width: number, height: number) {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => undefined,
  };
}

/** jsdom lays out nothing, so stamp drags need concrete geometry: a 100px
 * stamp near the top-left of a 400x500 loose layer. */
function mockDragRects(stamp: HTMLElement, layer?: Element | null) {
  vi.spyOn(stamp, "getBoundingClientRect").mockReturnValue(
    domRect(150, 100, 100, 100),
  );
  const page = (layer ??
    stamp.closest(".field-notes-loose-stamp-layer")) as HTMLElement;
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue(
    domRect(100, 50, 400, 500),
  );
}

describe("Field Notes stamp interactions", () => {
  beforeEach(() => resetFieldNotes());

  afterEach(() => {
    cleanup();
    resetFieldNotes();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("keeps the zero-count trigger and all zero-count copy out of production", () => {
    vi.stubEnv("NODE_ENV", "production");

    render(<FieldNotesChrome />);

    expect(
      screen.queryByRole("button", { name: /Open Field Notes/ }),
    ).toBeNull();
    expect(document.querySelector('[aria-label*="0 of"]')).toBeNull();
    expect(screen.queryByText(/0 of \d+ found/)).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens from the canonical Field Notes URL parameter", () => {
    window.history.replaceState(null, "", "/?fieldNotes=open");

    render(<FieldNotesChrome />);

    expect(
      screen.getByRole("dialog", { name: "Field Notes album" }),
    ).toBeTruthy();
  });

  it("adds the Field Notes URL parameter when opened", () => {
    earnFindingBeforeMount();
    render(<FieldNotesChrome />);

    fireEvent.click(
      screen.getByRole("button", {
        name: `Open Field Notes, 1 of ${FIELD_NOTE_BY_ID.size} found`,
      }),
    );

    expect(new URL(window.location.href).searchParams.get("fieldNotes")).toBe(
      "open",
    );
  });

  it("removes the Field Notes URL parameter when closed", () => {
    window.history.replaceState(null, "", "/?fieldNotes=open");
    render(<FieldNotesChrome />);

    fireEvent.click(screen.getByRole("button", { name: "Close Field Notes" }));

    expect(new URL(window.location.href).searchParams.has("fieldNotes")).toBe(
      false,
    );
  });

  it("preserves unrelated query parameters, the hash, and history state", () => {
    const state = { from: "field-map" };
    window.history.replaceState(state, "", "/?debug=1&view=map#books");
    earnFindingBeforeMount();
    render(<FieldNotesChrome />);

    fireEvent.click(
      screen.getByRole("button", {
        name: `Open Field Notes, 1 of ${FIELD_NOTE_BY_ID.size} found`,
      }),
    );

    const url = new URL(window.location.href);
    expect(url.searchParams.get("debug")).toBe("1");
    expect(url.searchParams.get("view")).toBe("map");
    expect(url.searchParams.get("fieldNotes")).toBe("open");
    expect(url.hash).toBe("#books");
    expect(window.history.state).toEqual(state);

    fireEvent.click(screen.getByRole("button", { name: "Close Field Notes" }));
    const closedUrl = new URL(window.location.href);
    expect(closedUrl.searchParams.get("debug")).toBe("1");
    expect(closedUrl.searchParams.get("view")).toBe("map");
    expect(closedUrl.searchParams.has("fieldNotes")).toBe(false);
    expect(closedUrl.hash).toBe("#books");
    expect(window.history.state).toEqual(state);
  });

  it("follows Field Notes URL state during back and forward navigation", () => {
    render(<FieldNotesChrome />);

    window.history.pushState(null, "", "/?fieldNotes=open");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(
      screen.getByRole("dialog", { name: "Field Notes album" }),
    ).toBeTruthy();

    window.history.pushState(null, "", "/");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(
      screen.queryByRole("dialog", { name: "Field Notes album" }),
    ).toBeNull();
  });

  it("establishes the first trigger before starting its award sequence", async () => {
    vi.useFakeTimers();
    render(<FieldNotesChrome />);

    await act(async () => {
      recordFieldNoteEvent({ type: "photo-mode-entered" });
      await Promise.resolve();
    });

    const trigger = screen.getByRole("button", {
      name: `Open Field Notes, 1 of ${FIELD_NOTE_BY_ID.size} found`,
    });
    expect(
      trigger.closest("[data-first-reveal]")?.getAttribute("data-first-reveal"),
    ).toBe("true");
    expect(
      screen.queryAllByRole("button", {
        name: "Open Field Notes to view Photo Finish",
      }),
    ).toHaveLength(0);

    await act(async () => vi.advanceTimersByTime(419));
    expect(
      screen.queryAllByRole("button", {
        name: "Open Field Notes to view Photo Finish",
      }),
    ).toHaveLength(0);

    await act(async () => vi.advanceTimersByTime(1));
    expect(
      screen.getAllByRole("button", {
        name: "Open Field Notes to view Photo Finish",
      }).length,
    ).toBeGreaterThan(0);
    expect(trigger.closest("[data-first-reveal]")).toBeNull();
  });

  it("shows the stamp title and hint when its mount is hovered", async () => {
    const note = FIELD_NOTE_BY_ID.get("beacon")!;
    render(
      <TooltipProvider>
        <PostageStamp note={note} progress={EMPTY_FIELD_NOTES_PROGRESS} />
      </TooltipProvider>,
    );

    fireEvent.mouseEnter(
      screen.getByRole("button", { name: /Beacon\. Not yet found\./ }),
    );

    await waitFor(() => {
      const tooltipText = screen.getByRole("tooltip").textContent;
      expect(tooltipText).toContain("Beacon");
      expect(tooltipText).toContain(
        "Try the tall lamp between Musings and Talks.",
      );
    });
  });

  it("restores page interaction when a turn animation never finishes", async () => {
    vi.useFakeTimers();
    render(
      <Dialog.Root open>
        <CompactAlbum
          open
          progress={EMPTY_FIELD_NOTES_PROGRESS}
          onClose={() => undefined}
        />
      </Dialog.Root>,
    );

    const stage = document.querySelector<HTMLElement>(
      ".field-notes-book-stage",
    )!;
    fireEvent.click(
      within(stage).getByRole("button", { name: "Next album page" }),
    );
    expect(stage.className).toContain("pointer-events-none");

    await act(async () => vi.advanceTimersByTime(1200));

    expect(stage.className).not.toContain("pointer-events-none");
    expect(stage.getAttribute("aria-busy")).toBe("false");
  });

  it("keeps the final desktop spread opaque while turning back", async () => {
    vi.useFakeTimers();
    render(
      <Dialog.Root open>
        <CompactAlbum
          open
          progress={EMPTY_FIELD_NOTES_PROGRESS}
          onClose={() => undefined}
        />
      </Dialog.Root>,
    );

    const stage = document.querySelector<HTMLElement>(
      ".field-notes-book-stage",
    )!;
    const next = () =>
      fireEvent.click(
        within(stage).getByRole("button", { name: "Next album page" }),
      );

    next();
    await act(async () => vi.advanceTimersByTime(1200));
    next();
    await act(async () => vi.advanceTimersByTime(1200));

    const settledPages = stage.querySelectorAll(
      ".field-notes-page-spread > .field-notes-page",
    );
    expect(settledPages).toHaveLength(2);
    expect(settledPages[1]?.className).toContain("field-notes-blank-page");

    fireEvent.click(
      within(stage).getByRole("button", { name: "Previous album page" }),
    );

    const staticRight = stage.querySelector<HTMLElement>(
      '.field-notes-turn-static[data-side="right"]',
    )!;
    expect(staticRight.querySelector(".field-notes-blank-page")).toBeTruthy();
    expect(within(staticRight).queryByText("Findings 25 to 36")).toBeNull();

    const leaf = stage.querySelector<HTMLElement>(
      '.field-notes-turn-leaf[data-direction="previous"]',
    )!;
    expect(
      within(leaf.querySelector(".field-notes-turn-front")!).getByText(
        "Findings 37 to 48",
      ),
    ).toBeTruthy();
    expect(
      within(leaf.querySelector(".field-notes-turn-back")!).getByText(
        "Findings 25 to 36",
      ),
    ).toBeTruthy();
  });

  it("mounts saved stamp placement before a page turn starts painting", async () => {
    window.localStorage.setItem(
      FIELD_NOTE_PLACEMENT_STORAGE_KEY,
      JSON.stringify({
        "early-alarm": { placed: true, x: 0.8, y: 0.2, tilt: 1.12 },
      }),
    );
    const progress = {
      ...EMPTY_FIELD_NOTES_PROGRESS,
      earned: { "early-alarm": 1 },
    };
    render(
      <Dialog.Root open>
        <CompactAlbum open progress={progress} onClose={() => undefined} />
      </Dialog.Root>,
    );

    const placementCorrections: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      placementCorrections.push(
        ...records.filter((record) => {
          const target = record.target as HTMLElement;
          return target.getAttribute("aria-label")?.startsWith("Early Alarm");
        }),
      );
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
      attributeOldValue: true,
      subtree: true,
    });

    const stage = document.querySelector<HTMLElement>(
      ".field-notes-book-stage",
    )!;
    await act(async () => {
      fireEvent.click(
        within(stage).getByRole("button", { name: "Next album page" }),
      );
      await Promise.resolve();
    });
    observer.disconnect();

    const stamps = within(stage)
      .getAllByRole("button", { name: /Early Alarm\. Found\./ })
      .filter((stamp) => stamp.closest(".field-notes-stamp-page") !== null);
    expect(stamps.length).toBeGreaterThan(0);
    for (const stamp of stamps)
      expect(stamp.style.getPropertyValue("--stamp-page-left")).toBe("80%");
    expect(
      placementCorrections.some((record) =>
        record.oldValue?.includes("--stamp-page-left: 0%"),
      ),
    ).toBe(false);
  });

  it("lets an earned stamp travel to the edge of its original page", () => {
    const note = FIELD_NOTE_BY_ID.get("beacon")!;
    const progress = {
      ...EMPTY_FIELD_NOTES_PROGRESS,
      earned: { beacon: 1 },
    };
    render(
      <TooltipProvider>
        <section className="field-notes-stamp-page">
          <div className="field-notes-loose-stamp-layer">
            <PostageStamp
              note={note}
              progress={progress}
              movable
              slotIndex={11}
            />
          </div>
        </section>
      </TooltipProvider>,
    );

    const stamp = screen.getByRole("button", {
      name: /Beacon\. Found\./,
    });
    vi.spyOn(stamp, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 100,
      x: 150,
      y: 100,
      top: 100,
      right: 250,
      bottom: 200,
      left: 150,
      toJSON: () => undefined,
    });
    const page = stamp.closest<HTMLElement>(".field-notes-loose-stamp-layer")!;
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 500,
      x: 100,
      y: 50,
      top: 50,
      right: 500,
      bottom: 550,
      left: 100,
      toJSON: () => undefined,
    });

    const pointerEvent = (
      type: string,
      clientX: number,
      clientY: number,
      button = 0,
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button,
        clientX,
        clientY,
      });
      Object.defineProperties(event, {
        pointerId: { value: 7 },
        pointerType: { value: "mouse" },
      });
      return event;
    };

    fireEvent(stamp, pointerEvent("pointerdown", 20, 20));
    fireEvent(stamp, pointerEvent("pointermove", 500, -500));

    expect(stamp.getAttribute("data-dragging")).toBe("true");
    expect(stamp.getAttribute("data-placed")).toBe("true");
    expect(stamp.style.getPropertyValue("--stamp-page-left")).toBe("86%");
    expect(
      Number.parseFloat(stamp.style.getPropertyValue("--stamp-page-top")),
    ).toBeCloseTo(11.2);

    fireEvent(stamp, pointerEvent("pointerup", 500, -500));

    const saved = JSON.parse(
      window.localStorage.getItem(FIELD_NOTE_PLACEMENT_STORAGE_KEY)!,
    ) as Record<
      string,
      { placed: boolean; x: number; y: number; tilt: number }
    >;
    expect(saved.beacon?.placed).toBe(true);
    expect(saved.beacon?.x).toBeCloseTo(0.86);
    expect(saved.beacon?.y).toBeCloseTo(0.112);
    expect(saved.beacon?.tilt).toBe(3);
  });

  it("resets stamp layout without clearing the earned stamp", () => {
    window.localStorage.setItem(
      FIELD_NOTE_PLACEMENT_STORAGE_KEY,
      JSON.stringify({
        beacon: { placed: true, x: 0.82, y: 0.17, tilt: 2 },
      }),
    );
    const note = FIELD_NOTE_BY_ID.get("beacon")!;
    const progress = {
      ...EMPTY_FIELD_NOTES_PROGRESS,
      earned: { beacon: 1 },
    };
    render(
      <TooltipProvider>
        <section className="field-notes-stamp-page">
          <div className="field-notes-loose-stamp-layer">
            <PostageStamp note={note} progress={progress} movable />
          </div>
        </section>
      </TooltipProvider>,
    );

    const stamp = screen.getByRole("button", { name: /Beacon\. Found\./ });
    expect(stamp.getAttribute("data-placed")).toBe("true");

    act(() => resetFieldNotePlacements());

    expect(stamp.getAttribute("data-placed")).toBe("false");
    expect(stamp.getAttribute("data-state")).toBe("earned");
  });

  it("quietly returns stamps on one page and offers a short undo", () => {
    window.localStorage.setItem(
      FIELD_NOTE_PLACEMENT_STORAGE_KEY,
      JSON.stringify({
        beacon: { placed: true, x: 0.82, y: 0.17, tilt: 2 },
        "early-alarm": { placed: true, x: 0.2, y: 0.8, tilt: -1 },
      }),
    );
    const progress = {
      ...EMPTY_FIELD_NOTES_PROGRESS,
      earned: { beacon: 1, "early-alarm": 1 },
    };
    render(
      <Dialog.Root open>
        <CompactAlbum open progress={progress} onClose={() => undefined} />
      </Dialog.Root>,
    );

    const desktopStage = document.querySelector<HTMLElement>(
      ".field-notes-book-stage",
    )!;
    const beacon = within(desktopStage)
      .getAllByRole("button", { name: /Beacon\. Found\./ })
      .find(
        (stamp) =>
          stamp.getAttribute("data-movable") === "true" &&
          stamp.closest(".field-notes-stamp-page") !== null,
      )!;
    expect(beacon.getAttribute("data-placed")).toBe("true");

    fireEvent.click(
      within(desktopStage).getByRole("button", {
        name: "Return stamps to their mounts",
      }),
    );

    expect(beacon.getAttribute("data-placed")).toBe("false");
    expect(
      JSON.parse(
        window.localStorage.getItem(FIELD_NOTE_PLACEMENT_STORAGE_KEY)!,
      ),
    ).toEqual({
      "early-alarm": { placed: true, x: 0.2, y: 0.8, tilt: -1 },
    });

    fireEvent.click(within(desktopStage).getByRole("button", { name: "undo" }));

    expect(beacon.getAttribute("data-placed")).toBe("true");
    const restored = JSON.parse(
      window.localStorage.getItem(FIELD_NOTE_PLACEMENT_STORAGE_KEY)!,
    ) as Record<
      string,
      { placed: boolean; x: number; y: number; tilt: number }
    >;
    expect(restored.beacon).toEqual({
      placed: true,
      x: 0.82,
      y: 0.17,
      tilt: 2,
    });
  });

  it("records a stamp placement toward the philatelist finding", () => {
    const note = FIELD_NOTE_BY_ID.get("beacon")!;
    const progress = {
      ...EMPTY_FIELD_NOTES_PROGRESS,
      earned: { beacon: 1 },
    };
    render(
      <TooltipProvider>
        <section className="field-notes-stamp-page">
          <div className="field-notes-loose-stamp-layer">
            <PostageStamp note={note} progress={progress} movable />
          </div>
        </section>
      </TooltipProvider>,
    );

    const stamp = screen.getByRole("button", { name: /Beacon\. Found\./ });
    mockDragRects(stamp);

    fireEvent(stamp, touchPointer("pointerdown", 3, 180, 120));
    fireEvent(stamp, touchPointer("pointermove", 3, 260, 160));
    fireEvent(stamp, touchPointer("pointerup", 3, 260, 160));

    const persisted = JSON.parse(
      window.localStorage.getItem(FIELD_NOTES_STORAGE_KEY)!,
    ) as FieldNotesProgress;
    expect(persisted.placedStamps).toEqual(["beacon"]);
  });

  it("keeps the newest-findings tray movable in its own overview scope", () => {
    const progress = {
      ...EMPTY_FIELD_NOTES_PROGRESS,
      earned: { beacon: 1, "early-alarm": 2, "tea-time": 3, "old-time": 4 },
    };
    render(
      <Dialog.Root open>
        <CompactAlbum open progress={progress} onClose={() => undefined} />
      </Dialog.Root>,
    );

    const trays = document.querySelectorAll<HTMLElement>(
      ".field-notes-latest-tray",
    );
    expect(trays.length).toBeGreaterThan(0);
    const tray = trays[0]!;
    // Three newest by earned time, the fourth-oldest left on its page.
    const trayStamps = within(tray).getAllByRole("button", { name: /Found\./ });
    expect(
      trayStamps.map(
        (stamp) => stamp.getAttribute("aria-label")?.split(".")[0],
      ),
    ).toEqual(["Old Time", "Tea Time", "Early Alarm"]);
    for (const stamp of trayStamps)
      expect(stamp.getAttribute("data-movable")).toBe("true");

    const oldTime = trayStamps[0]!;
    mockDragRects(
      oldTime,
      tray.querySelector(".field-notes-loose-stamp-layer"),
    );

    fireEvent(oldTime, touchPointer("pointerdown", 5, 180, 120));
    fireEvent(oldTime, touchPointer("pointermove", 5, 280, 130));
    fireEvent(oldTime, touchPointer("pointerup", 5, 280, 130));

    const overview = JSON.parse(
      window.localStorage.getItem(FIELD_NOTE_OVERVIEW_PLACEMENT_STORAGE_KEY)!,
    ) as Record<string, { placed: boolean }>;
    expect(overview["old-time"]?.placed).toBe(true);
    expect(
      window.localStorage.getItem(FIELD_NOTE_PLACEMENT_STORAGE_KEY),
    ).toBeNull();
  });

  it("shows fewer newest findings gracefully at low counts", () => {
    const progress = {
      ...EMPTY_FIELD_NOTES_PROGRESS,
      earned: { beacon: 1 },
    };
    render(
      <Dialog.Root open>
        <CompactAlbum open progress={progress} onClose={() => undefined} />
      </Dialog.Root>,
    );

    const tray = document.querySelector<HTMLElement>(
      ".field-notes-latest-tray",
    )!;
    expect(
      within(tray).getAllByRole("button", { name: /Found\./ }),
    ).toHaveLength(1);
    expect(
      tray.querySelectorAll(".field-notes-empty-stamp-mount"),
    ).toHaveLength(3);
  });

  it("pages forward and back from horizontal touch swipes", async () => {
    vi.useFakeTimers();
    render(
      <Dialog.Root open>
        <CompactAlbum
          open
          progress={EMPTY_FIELD_NOTES_PROGRESS}
          onClose={() => undefined}
        />
      </Dialog.Root>,
    );

    const stage = document.querySelector<HTMLElement>(
      ".field-notes-mobile-stage",
    )!;
    fireEvent(stage, touchPointer("pointerdown", 11, 240, 300));
    fireEvent(stage, touchPointer("pointermove", 11, 180, 302));
    fireEvent(stage, touchPointer("pointerup", 11, 150, 302));

    expect(stage.getAttribute("aria-busy")).toBe("true");
    const leaf = stage.querySelector(".field-notes-mobile-turn-leaf");
    expect(leaf?.getAttribute("data-direction")).toBe("next");

    await act(async () => vi.advanceTimersByTime(1200));
    expect(stage.getAttribute("aria-busy")).toBe("false");
    // The settled page remains: page 2's heading is in the static block.
    expect(within(stage).getAllByText("Findings 01 to 12")).not.toHaveLength(0);

    fireEvent(stage, touchPointer("pointerdown", 12, 150, 300));
    fireEvent(stage, touchPointer("pointermove", 12, 220, 302));
    fireEvent(stage, touchPointer("pointerup", 12, 240, 302));

    expect(
      stage
        .querySelector(".field-notes-mobile-turn-leaf")
        ?.getAttribute("data-direction"),
    ).toBe("previous");
    await act(async () => vi.advanceTimersByTime(1200));
    expect(within(stage).getAllByText("Field Notes")).not.toHaveLength(0);
  });

  it("ignores a backward swipe on the first page and taps inside the slop", () => {
    render(
      <Dialog.Root open>
        <CompactAlbum
          open
          progress={EMPTY_FIELD_NOTES_PROGRESS}
          onClose={() => undefined}
        />
      </Dialog.Root>,
    );

    const stage = document.querySelector<HTMLElement>(
      ".field-notes-mobile-stage",
    )!;
    fireEvent(stage, touchPointer("pointerdown", 13, 150, 300));
    fireEvent(stage, touchPointer("pointermove", 13, 260, 300));
    fireEvent(stage, touchPointer("pointerup", 13, 260, 300));
    expect(stage.getAttribute("aria-busy")).toBe("false");

    fireEvent(stage, touchPointer("pointerdown", 14, 200, 300));
    fireEvent(stage, touchPointer("pointermove", 14, 206, 302));
    fireEvent(stage, touchPointer("pointerup", 14, 206, 302));
    expect(stage.getAttribute("aria-busy")).toBe("false");
  });

  it("dismisses the album on a downward swipe but never on an upward one", () => {
    const onClose = vi.fn();
    render(
      <Dialog.Root open>
        <CompactAlbum
          open
          progress={EMPTY_FIELD_NOTES_PROGRESS}
          onClose={onClose}
        />
      </Dialog.Root>,
    );

    const stage = document.querySelector<HTMLElement>(
      ".field-notes-mobile-stage",
    )!;
    fireEvent(stage, touchPointer("pointerdown", 15, 200, 200));
    fireEvent(stage, touchPointer("pointermove", 15, 202, 260));
    fireEvent(stage, touchPointer("pointerup", 15, 204, 160));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent(stage, touchPointer("pointerdown", 16, 200, 200));
    fireEvent(stage, touchPointer("pointermove", 16, 202, 260));
    fireEvent(stage, touchPointer("pointerup", 16, 204, 320));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps a swipe that starts on a movable stamp with the stamp", () => {
    const progress = {
      ...EMPTY_FIELD_NOTES_PROGRESS,
      earned: { beacon: 1 },
    };
    render(
      <Dialog.Root open>
        <CompactAlbum open progress={progress} onClose={() => undefined} />
      </Dialog.Root>,
    );

    const stage = document.querySelector<HTMLElement>(
      ".field-notes-mobile-stage",
    )!;
    const trayStamp = within(stage).getAllByRole("button", {
      name: /Beacon\. Found\./,
    })[0]!;

    fireEvent(trayStamp, touchPointer("pointerdown", 17, 200, 300));
    fireEvent(trayStamp, touchPointer("pointermove", 17, 120, 300));
    fireEvent(trayStamp, touchPointer("pointerup", 17, 120, 300));

    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(stage.querySelector(".field-notes-mobile-turn-leaf")).toBeNull();
  });

  it("absorbs rapid repeated swipes into one clean page turn", async () => {
    vi.useFakeTimers();
    render(
      <Dialog.Root open>
        <CompactAlbum
          open
          progress={EMPTY_FIELD_NOTES_PROGRESS}
          onClose={() => undefined}
        />
      </Dialog.Root>,
    );

    const stage = document.querySelector<HTMLElement>(
      ".field-notes-mobile-stage",
    )!;
    for (const pointerId of [21, 22, 23]) {
      fireEvent(stage, touchPointer("pointerdown", pointerId, 240, 300));
      fireEvent(stage, touchPointer("pointermove", pointerId, 160, 300));
      fireEvent(stage, touchPointer("pointerup", pointerId, 150, 300));
    }

    expect(
      stage.querySelectorAll(".field-notes-mobile-turn-leaf"),
    ).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(1200));

    expect(stage.getAttribute("aria-busy")).toBe("false");
    // One swipe advanced one page, not three.
    expect(within(stage).getAllByText("Findings 01 to 12")).not.toHaveLength(0);
    expect(within(stage).queryAllByText("Findings 13 to 24")).toHaveLength(0);
  });

  it("keeps touch hints working for stamps that cannot move", async () => {
    const note = FIELD_NOTE_BY_ID.get("beacon")!;
    render(
      <TooltipProvider>
        <PostageStamp note={note} progress={EMPTY_FIELD_NOTES_PROGRESS} />
      </TooltipProvider>,
    );

    const stamp = screen.getByRole("button", {
      name: /Beacon\. Not yet found\./,
    });
    const event = new MouseEvent("pointerup", { bubbles: true });
    Object.defineProperties(event, {
      pointerId: { value: 2 },
      pointerType: { value: "touch" },
    });
    fireEvent(stamp, event);

    await waitFor(() => {
      expect(screen.getByRole("tooltip").textContent).toContain("Beacon");
    });
  });
});
