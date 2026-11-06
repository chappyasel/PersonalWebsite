// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type BookingPage, addDays } from "~/lib/booking/page";
import { MESSAGES, REQUEST_ID } from "~/lib/booking/request";
import type * as Zones from "~/lib/booking/zones";
import { zonedTime } from "~/lib/booking/zones";

import { MeetBooking } from "./MeetBooking";
import { WeekStrip } from "./WeekStrip";

const PT = "America/Los_Angeles";
const at = (hour: number, minute = 0, day = "2026-11-10") =>
  zonedTime(day, hour * 60 + minute, PT);

/** The innermost element that reads `text` whole, where a time's "a" or
 * "p" or a date's "th" sits in a span of its own. */
const byWholeText = (text: string) =>
  screen.getByText(
    (_, element) =>
      element?.textContent === text &&
      ![...element.children].some((child) => child.textContent === text),
  );

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  invalidate: vi.fn(),
  query: vi.fn(),
}));

vi.mock("~/lib/booking/zones", async (original) => ({
  ...(await original<typeof Zones>()),
  browserTimeZone: () => "America/New_York",
}));

// The roll draws a second copy of a line while it runs; these tests read the
// text, and rolling-text.test.tsx tests the roll.
vi.mock("~/components/ui/rolling-text", () => ({
  SwapText: ({ text }: { text: string }) => <span>{text}</span>,
  Count: ({ value }: { value: number }) => <span>{value}</span>,
  FadeIn: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    booking: {
      book: {
        useMutation: () => ({
          mutateAsync: mocks.mutateAsync,
          isPending: false,
        }),
      },
    },
    // Each block read answers what `mocks.query` gives for its input, else
    // its initial data, else nothing yet.
    useQueries: (
      build: (t: {
        booking: { page: (input: unknown, options: unknown) => unknown };
      }) => { input: unknown; options: { initialData?: unknown } }[],
    ) =>
      build({
        booking: { page: (input, options) => ({ input, options }) },
      }).map(({ input, options }) => ({
        data: (mocks.query(input) as unknown) ?? options.initialData,
        isError: false,
        refetch: vi.fn(),
      })),
    useUtils: () => ({
      booking: { page: { invalidate: mocks.invalidate } },
    }),
  },
}));

const PAGE: BookingPage = {
  link: {
    slug: "meet",
    title: "Meet with Chappy",
    host: "Chappy",
    lengths: [15, 30, 60],
    defaultLength: 30,
    call: { kind: "meet" },
  },
  timeZone: PT,
  firstDay: "2026-11-10",
  lastDay: "2026-11-30",
  days: [
    {
      day: "2026-11-10",
      open: [
        { start: at(9), end: at(10) },
        { start: at(11), end: at(12) },
      ],
    },
    {
      day: "2026-11-11",
      open: [{ start: at(10, 0, "2026-11-11"), end: at(11, 0, "2026-11-11") }],
    },
  ],
  suggested: [at(11)],
};

/** A week of Days from `from`, each open 9 to 10 AM PT. */
function weekFrom(from: string): BookingPage["days"] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(from, i);
    return { day, open: [{ start: at(9, 0, day), end: at(10, 0, day) }] };
  });
}

/** The computer's grid, and the phone's: jsdom draws both. */
function computerGrid() {
  return screen.getAllByRole("group", { name: "Open times this week" })[0]!;
}
function phoneGrid() {
  return screen.getAllByRole("group", { name: "Open times this week" })[1]!;
}

/** The card's top: the Day, the time, and the host's clock. */
function cardTop() {
  return document.querySelector("[data-peek-end]")?.textContent ?? "";
}

const shownDays = (grid: HTMLElement) =>
  [...grid.querySelectorAll<HTMLElement>("[data-day]")].map(
    (d) => d.dataset.day,
  );

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "Ana Lopez");
  await user.type(screen.getByLabelText("Email"), "ana@example.com");
  await user.type(screen.getByLabelText(/^What it's about/), "Planning");
  return user;
}

describe("booking on /meet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockReset();
  });
  afterEach(cleanup);

  it("opens on the best time, in both zones, and keeps its star on the meeting", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    expect(cardTop()).toContain("Tue, Nov 10th");
    expect(cardTop()).toContain("2:00-2:30p ET");
    expect(cardTop()).not.toContain("30m");
    expect(byWholeText("11:00a PT for Chappy")).toBeTruthy();
    expect(screen.getByText("Best")).toBeTruthy();
    expect(screen.getByText("Google Meet")).toBeTruthy();
    // The white dot on each grid's meeting, the computer's and the phone's.
    expect(
      document.querySelectorAll("[data-selection][data-best]"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Book 30 minutes" }),
    ).toBeTruthy();
  });

  it("reads its own link and shows no length picker when it offers one", () => {
    render(
      <MeetBooking
        slug="15"
        initial={{
          ...PAGE,
          link: { ...PAGE.link, slug: "15", lengths: [15], defaultLength: 15 },
        }}
      />,
    );
    expect(mocks.query).toHaveBeenCalledWith({
      slug: "15",
      from: "2026-11-10",
    });
    expect(screen.queryByRole("group", { name: "Length" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Book 15 minutes" }),
    ).toBeTruthy();
  });

  it("steps a week on a computer and 3 Days on a phone, from Days in hand", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    expect(screen.getByRole("button", { name: "Earlier week" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Later days" }));
    expect(shownDays(computerGrid())[0]).toBe("2026-11-13");
    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    expect(shownDays(computerGrid())[0]).toBe("2026-11-20");
    fireEvent.click(screen.getByRole("button", { name: "Earlier week" }));
    fireEvent.click(screen.getByRole("button", { name: "Earlier week" }));
    expect(shownDays(computerGrid())[0]).toBe("2026-11-10");
    // The first read holds all 21 bookable Days, so nothing more was asked.
    for (const [input] of mocks.query.mock.calls)
      expect(input).toEqual({ slug: "meet", from: "2026-11-10" });
    // A Day the read left out has nothing open, and says so.
    expect(screen.getAllByText("No open times").length).toBeGreaterThan(0);
  });

  it("steps to the next week when the arrow keys run past its last Day", () => {
    // Open on Nov 10th and 11th, then nothing until 9 AM on the 19th.
    const days = [
      ...PAGE.days,
      {
        day: "2026-11-19",
        open: [{ start: at(9, 0, "2026-11-19"), end: at(10, 0, "2026-11-19") }],
      },
    ];
    render(<MeetBooking slug="meet" initial={{ ...PAGE, days }} />);
    const grid = computerGrid();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(cardTop()).toContain("Wed, Nov 11th");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    // Nov 10th to 16th has nothing later, so the week steps to hold the 19th.
    expect(shownDays(computerGrid())[0]).toBe("2026-11-17");
    expect(cardTop()).toContain("Thu, Nov 19th");
    fireEvent.keyDown(computerGrid(), { key: "ArrowLeft" });
    expect(shownDays(computerGrid())[0]).toBe("2026-11-10");
    expect(cardTop()).toContain("Wed, Nov 11th");
  });

  it("reads the next 28 Days two weeks before the grid reaches them, and spins only the Days it waits on", () => {
    render(
      <MeetBooking slug="meet" initial={{ ...PAGE, lastDay: "2027-01-31" }} />,
    );
    const asked = () =>
      mocks.query.mock.calls.some(
        ([input]) => (input as { from: string }).from === "2026-12-08",
      );
    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    expect(asked()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    expect(asked()).toBe(true);
    // Nov 24th to 30th are in the first read: no spinner, no dimming.
    expect(computerGrid().closest("[aria-busy]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    // Dec 8th to 14th are the second read, which hasn't come back: those Days alone wait.
    const busy = computerGrid().closest("[aria-busy]");
    expect(busy).toBeTruthy();
    expect(
      [...computerGrid().querySelectorAll("[data-day]")].filter(
        (day) => day.querySelector('[class*="dayLoading"]') !== null,
      ),
    ).toHaveLength(7);
  });

  it("draws the phone's grid, 3 Days with the rail inside 375px, and no time buttons", () => {
    render(
      <MeetBooking
        slug="meet"
        initial={{ ...PAGE, days: weekFrom("2026-11-10") }}
      />,
    );
    const phone = phoneGrid();
    expect(shownDays(phone)).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
    // 375px less the 16px gutters, plus the 12px the grid reaches into the
    // left one, is 355px; the 40px rail leaves each Day 105px, and nothing
    // in the columns holds them wider.
    // The grid sits in the row that slides, in the window that clips it
    // over the Days' columns, in the frame that lays them out.
    const window = phone.parentElement!.parentElement!;
    expect(window.style.gridColumn).toBe("2 / span 3");
    const frame = window.parentElement!;
    expect(frame.style.gridTemplateColumns).toBe(
      "2.5rem minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
    );
    // Both grids label the booker's rail; only the computer's has Chappy's.
    expect(screen.getAllByText("ET")).toHaveLength(2);
    expect(screen.getAllByText("PT")).toHaveLength(1);
    // The only time buttons are the screen readers', out of sight.
    for (const button of screen.getAllByRole("button", { name: /your time/ }))
      expect(button.closest(".sr-only")).toBeTruthy();
  });

  it("steps the phone's visible Days by 3", () => {
    render(
      <MeetBooking
        slug="meet"
        initial={{ ...PAGE, days: weekFrom("2026-11-10") }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Later days" }));
    expect(shownDays(phoneGrid())).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Later days" }));
    expect(shownDays(phoneGrid())).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Earlier days" }));
    expect(shownDays(phoneGrid())[0]).toBe("2026-11-13");
  });

  it("gives screen readers the phone's open starts as buttons that pick", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    const days = screen.getAllByRole("region");
    expect(days.map((d) => d.getAttribute("aria-label"))).toEqual([
      "Tue, Nov 10th",
      "Wed, Nov 11th",
    ]);
    // 9:00 and 9:30 PT, then 11:00 and 11:30 on the first Day, at 30m.
    expect(
      screen
        .getAllByRole("button", { name: /your time/ })
        .map((b) => b.textContent),
    ).toEqual([
      "12:00 PM your time, 9:00 AM for Chappy",
      "12:30 PM your time, 9:30 AM for Chappy",
      "2:00 PM your time, 11:00 AM for Chappy, best",
      "2:30 PM your time, 11:30 AM for Chappy",
      "1:00 PM your time, 10:00 AM for Chappy",
      "1:30 PM your time, 10:30 AM for Chappy",
    ]);
    const best = screen.getByRole("button", {
      name: "2:00 PM your time, 11:00 AM for Chappy, best",
    });
    expect(best.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(
      screen.getByRole("button", {
        name: "12:30 PM your time, 9:30 AM for Chappy",
      }),
    );
    expect(best.getAttribute("aria-pressed")).toBe("false");
    expect(byWholeText("9:30a PT for Chappy")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Book 30 minutes" }),
    ).toBeTruthy();
  });

  it("offers a length picker only when the link has several", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    expect(screen.getByRole("group", { name: "Length" })).toBeTruthy();
  });

  it("resizes the selection when the length changes", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    const grid = computerGrid();
    // 9:00, then a half hour on: 9:30 PT, 12:30 PM for the booker.
    for (const key of ["Home", "ArrowDown"]) fireEvent.keyDown(grid, { key });
    expect(cardTop()).toContain("12:30-1:00p ET");
    fireEvent.click(screen.getByRole("button", { name: "60 minutes" }));
    // 9:30 PT can't hold an hour before 10, so the meeting slides to 9:00.
    expect(
      screen.getByRole("button", { name: "Book 60 minutes" }),
    ).toBeTruthy();
    expect(cardTop()).toContain("12:00-1:00p ET");
    // The block on each grid, the computer's and the phone's: the Day over
    // the time.
    const blocks = [...document.querySelectorAll("[data-selection]")];
    expect(blocks.map((b) => b.textContent)).toEqual(
      Array(2).fill("Tue, Nov 10th12:00-1:00p9:00a PT"),
    );
  });

  it("books with what it's about left empty, takes a LinkedIn path, and celebrates", async () => {
    mocks.mutateAsync.mockResolvedValueOnce({
      ok: true,
      booked: { start: at(11), end: at(11, 30), title: "Ana 🤝 Chappy" },
    });
    render(<MeetBooking slug="meet" initial={PAGE} />);
    expect(screen.getByLabelText(/^What it's about/)).toHaveProperty(
      "required",
      false,
    );
    // LinkedIn's and this field's.
    expect(screen.getAllByText("Optional")).toHaveLength(2);
    // No hints under the fields: where the invite goes is plain.
    expect(screen.queryByText("It goes in the invite.")).toBeNull();
    expect(screen.queryByText("The invite goes here.")).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Ana Lopez");
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.type(screen.getByPlaceholderText("/in/chappyasel"), "/in/ana");
    await user.click(screen.getByRole("button", { name: "Book 30 minutes" }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledOnce());
    const sent = mocks.mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("about");
    expect(sent).toMatchObject({
      start: at(11),
      linkedin: "linkedin.com/in/ana",
    });
    expect(
      await screen.findByRole("heading", { name: "You're meeting Chappy" }),
    ).toBeTruthy();
  });

  it("asks for another time when the slot was just taken", async () => {
    mocks.mutateAsync.mockResolvedValueOnce({
      ok: false,
      code: "taken",
      message: MESSAGES.taken,
    });
    render(<MeetBooking slug="meet" initial={PAGE} />);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Book 30 minutes" }));
    expect((await screen.findByRole("alert")).textContent).toBe(MESSAGES.taken);
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Pick a time first" }),
    ).toBeTruthy();
  });

  it("retries a dropped request with the same request ID, then confirms", async () => {
    mocks.mutateAsync
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true,
        booked: {
          start: at(11),
          end: at(11, 30),
          title: "Ana 🤝 Chappy",
        },
      });
    render(<MeetBooking slug="meet" initial={PAGE} />);
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Book 30 minutes" }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(2));
    const [first, second] = mocks.mutateAsync.mock.calls.map(
      ([input]) => (input as { requestId: string }).requestId,
    );
    expect(first).toMatch(REQUEST_ID);
    expect(mocks.mutateAsync.mock.calls[0]![0]).toMatchObject({
      slug: "meet",
      length: 30,
    });
    expect(second).toBe(first);

    const heading = await screen.findByRole("heading", {
      name: "You're meeting Chappy",
    });
    expect(document.activeElement).toBe(heading);
    expect(document.body.textContent).toContain("2:00-2:30p ET");
    expect(document.body.textContent).toContain("11:00-11:30a PT for Chappy");
    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(document.body.textContent).toContain(
      "Invite sent to ana@example.com",
    );
    expect(document.body.textContent).toContain("Google Meet");
  });
});

describe("the week strip from the keyboard", () => {
  afterEach(cleanup);

  const strip = (selection: number | null, onSelect = vi.fn()) => {
    render(
      <WeekStrip
        days={PAGE.days}
        hostZone={PT}
        bookerZone="America/New_York"
        host="Chappy"
        length={30}
        selection={selection}
        suggestions={PAGE.suggested}
        onSelect={onSelect}
        onConfirm={vi.fn()}
      />,
    );
    return {
      group: screen.getByRole("group", { name: "Open times this week" }),
      onSelect,
    };
  };

  it("starts on the best slot", () => {
    const { group, onSelect } = strip(null);
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledWith(at(11));
  });

  it("moves a half hour, an hour, and across busy time", () => {
    const { group, onSelect } = strip(at(9));
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith(at(9, 30));
    fireEvent.keyDown(group, { key: "ArrowDown", shiftKey: true });
    // Two starts on, across the busy hour; the spy leaves the prop at 9:00.
    expect(onSelect).toHaveBeenLastCalledWith(at(11));
    fireEvent.keyDown(group, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(at(11, 30));
    fireEvent.keyDown(group, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith(at(9));
  });

  it("moves to the same time on the next day, or the nearest open one", () => {
    const { group, onSelect } = strip(at(9, 30));
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith(at(10, 0, "2026-11-11"));
  });

  it("shows the host's clock beside the booker's", () => {
    strip(at(11));
    expect(screen.getByText("ET")).toBeTruthy();
    expect(byWholeText("PT")).toBeTruthy();
    // The block reads the Day and the booker's start. The host's clock is
    // there too, for a block tall enough to show it (meet.module.css).
    const block = document.querySelector("[data-selection]")!;
    expect(block.textContent).toBe("Tue, Nov 10th2:00p11:00a PT");
    expect(block.querySelector('[class*="selectionHost"]')).toBeTruthy();
    expect(block.querySelector('[class*="selectionDate"]')).toBeTruthy();
  });

  it("goes on to the next week from the last Day, and back from the first", () => {
    const onPastEdge = vi.fn();
    render(
      <WeekStrip
        days={PAGE.days}
        hostZone={PT}
        bookerZone="America/New_York"
        host="Chappy"
        length={30}
        selection={at(10, 0, "2026-11-11")}
        suggestions={[]}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onPastEdge={onPastEdge}
      />,
    );
    const group = screen.getByRole("group", { name: "Open times this week" });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    // 10:00 PT, in minutes past midnight on the host's clock.
    expect(onPastEdge).toHaveBeenLastCalledWith(1, 600);
  });

  it("puts both clocks on a block long enough for two lines", () => {
    render(
      <WeekStrip
        days={PAGE.days}
        hostZone={PT}
        bookerZone="America/New_York"
        host="Chappy"
        length={60}
        selection={at(11)}
        suggestions={[]}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-selection]")?.textContent).toBe(
      "Tue, Nov 10th2:00-3:00p11:00a PT",
    );
  });
});

describe("the phone's grid by touch", () => {
  // jsdom has no layout or PointerEvent: each Day is a 100px column from the
  // left, its top at 0, and a minute is a pixel down from 9:00 PT.
  beforeEach(() => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const index = PAGE.days.findIndex((d) => d.day === this.dataset.day);
        const left = Math.max(0, index) * 100;
        return DOMRect.fromRect({ x: left, y: 0, width: 100, height: 180 });
      },
    );
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const phone = (selection: number | null = null) => {
    const props = {
      onSelect: vi.fn(),
      onPicked: vi.fn(),
      onStep: vi.fn(),
    };
    render(
      <WeekStrip
        compact
        days={PAGE.days}
        hostZone={PT}
        bookerZone="America/New_York"
        host="Chappy"
        length={30}
        selection={selection}
        suggestions={PAGE.suggested}
        onConfirm={vi.fn()}
        canStep={{ earlier: false, later: true }}
        {...props}
      />,
    );
    const group = screen.getByRole("group", { name: "Open times this week" });
    const touch = { pointerType: "touch", pointerId: 7 };
    return { group, touch, ...props };
  };

  it("keeps one hover block and one meeting as the pointer and the pick move", () => {
    const { group, onSelect } = phone(at(11));
    const mouse = { pointerType: "mouse", pointerId: 1 };
    // 9:30 and 11:30 on the first Day, then 10:30 on the second, at 72px
    // an hour and 4px down for the panel's inset.
    for (const [x, y] of [
      [50, 40],
      [50, 184],
      [150, 112],
    ] as const) {
      fireEvent.pointerMove(group, { ...mouse, clientX: x, clientY: y });
      expect(document.querySelectorAll('[class*="ghost"]')).toHaveLength(1);
    }
    for (const [x, y] of [
      [50, 40],
      [150, 112],
    ] as const) {
      fireEvent.pointerDown(group, { ...mouse, clientX: x, clientY: y });
      fireEvent.pointerUp(group, { ...mouse, clientX: x, clientY: y });
    }
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("[data-selection]")).toHaveLength(1);
    expect(
      document.querySelectorAll('[class*="ghost"]').length,
    ).toBeLessThanOrEqual(1);
  });

  it("picks the time a tap lands on, and says so", () => {
    const { group, touch, onSelect, onPicked } = phone();
    // 11:40 PT on the first Day: the meeting centred on it would start at
    // 11:25, so it starts on the half hour nearest, 11:30.
    fireEvent.pointerDown(group, { ...touch, clientX: 50, clientY: 191 });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.pointerUp(group, { ...touch, clientX: 52, clientY: 192 });
    expect(onSelect).toHaveBeenCalledWith(at(11, 30));
    expect(onPicked).toHaveBeenCalledOnce();
  });

  it("leaves a touch the page scrolls with alone", () => {
    const { group, touch, onSelect } = phone();
    fireEvent.pointerDown(group, { ...touch, clientX: 50, clientY: 150 });
    fireEvent.pointerCancel(group, touch);
    fireEvent.pointerUp(group, { ...touch, clientX: 50, clientY: 150 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("steps the Days on a sideways swipe, only where it can go", () => {
    vi.useFakeTimers();
    const { group, touch, onStep, onSelect } = phone();
    fireEvent.pointerDown(group, { ...touch, clientX: 150, clientY: 60 });
    fireEvent.pointerMove(group, { ...touch, clientX: 120, clientY: 62 });
    fireEvent.pointerMove(group, { ...touch, clientX: 70, clientY: 64 });
    fireEvent.pointerUp(group, { ...touch, clientX: 70, clientY: 64 });
    // It glides on to the next Days, then steps to them.
    expect(onStep).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(onStep).toHaveBeenCalledWith(1);
    expect(onSelect).not.toHaveBeenCalled();
    // These Days don't step, so the glide comes back.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();

    // Nothing comes before the first Day.
    fireEvent.pointerDown(group, { ...touch, clientX: 50, clientY: 60 });
    fireEvent.pointerMove(group, { ...touch, clientX: 150, clientY: 60 });
    fireEvent.pointerUp(group, { ...touch, clientX: 150, clientY: 60 });
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("drags the meeting when the touch starts on it", () => {
    const { touch, onSelect, onPicked } = phone(at(11));
    const block = byWholeText("2:00p");
    fireEvent.pointerDown(block, { ...touch, clientX: 50, clientY: 125 });
    // Ten minutes down rounds back to 11:00, and 25 reaches the half hour.
    fireEvent.pointerMove(block, { ...touch, clientX: 50, clientY: 135 });
    expect(onSelect).toHaveBeenLastCalledWith(at(11));
    fireEvent.pointerMove(block, { ...touch, clientX: 50, clientY: 150 });
    expect(onSelect).toHaveBeenLastCalledWith(at(11, 30));
    fireEvent.pointerUp(block, { ...touch, clientX: 50, clientY: 150 });
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("books the start a tap picks on the phone's grid, in a bar that a tap on it opens", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    render(<MeetBooking slug="meet" initial={PAGE} />);
    // The card is a sheet on a phone, not a panel beside the grid.
    expect(screen.queryByRole("complementary")).toBeNull();
    const sheet = screen.getByRole("dialog", { name: "Your booking" });
    const handle = screen.getByRole("button", {
      name: "Show the whole booking",
    });
    // It peeks with the first best time.
    expect(sheet.getAttribute("aria-hidden")).toBeNull();
    expect(cardTop()).toContain("2:00-2:30p ET");
    const touch = { pointerType: "touch", pointerId: 7 };
    fireEvent.pointerDown(phoneGrid(), { ...touch, clientX: 50, clientY: 191 });
    fireEvent.pointerUp(phoneGrid(), { ...touch, clientX: 50, clientY: 191 });
    // 11:40 PT: on the half hour nearest centring on it, 11:30, 2:30 PM for
    // the booker.
    expect(cardTop()).toContain("2:30-3:00p ET");
    expect(byWholeText("11:30a PT for Chappy")).toBeTruthy();
    // The grid's tap only moved the time in the bar; a tap on the bar
    // grows it into the card.
    expect(handle.getAttribute("aria-label")).toBe("Show the whole booking");
    fireEvent.click(document.querySelector("[data-peek-end]")!);
    expect(handle.getAttribute("aria-label")).toBe("Show less");
    // And a tap on the same place shrinks it back.
    fireEvent.click(document.querySelector("[data-peek-end]")!);
    expect(handle.getAttribute("aria-label")).toBe("Show the whole booking");
  });

  it("shows only the booker's rail", () => {
    phone();
    expect(screen.getByText("ET")).toBeTruthy();
    expect(screen.queryByText("PT")).toBeNull();
    expect(screen.queryByText("Chappy")).toBeNull();
  });
});
