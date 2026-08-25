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
  FIELD_NOTE_PLACEMENT_STORAGE_KEY,
  resetFieldNotePlacements,
} from "./placement";
import {
  EMPTY_FIELD_NOTES_PROGRESS,
  recordFieldNoteEvent,
  resetFieldNotes,
} from "./progress";

function earnFindingBeforeMount() {
  recordFieldNoteEvent({ type: "photo-mode-entered" });
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

    const stamps = within(stage).getAllByRole("button", {
      name: /Early Alarm\. Found\./,
    });
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
      .find((stamp) => stamp.getAttribute("data-movable") === "true")!;
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
