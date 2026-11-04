// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingPage } from "~/lib/booking/page";
import { MESSAGES, REQUEST_ID } from "~/lib/booking/request";
import type * as Zones from "~/lib/booking/zones";
import { zonedTime } from "~/lib/booking/zones";

import { MeetBooking } from "./MeetBooking";
import { WeekStrip } from "./WeekStrip";

const PT = "America/Los_Angeles";
const at = (hour: number, minute = 0, day = "2026-11-10") =>
  zonedTime(day, hour * 60 + minute, PT);

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  invalidate: vi.fn(),
  query: vi.fn(),
}));

vi.mock("~/lib/booking/zones", async (original) => ({
  ...(await original<typeof Zones>()),
  browserTimeZone: () => "America/New_York",
}));

vi.mock("~/trpc/react", () => ({
  api: {
    booking: {
      page: {
        useQuery: (input: unknown, options: { initialData?: unknown }) => ({
          data: (mocks.query(input), options.initialData),
          isPlaceholderData: false,
          refetch: vi.fn(),
        }),
      },
      book: {
        useMutation: () => ({
          mutateAsync: mocks.mutateAsync,
          isPending: false,
        }),
      },
    },
    useUtils: () => ({ booking: { page: { invalidate: mocks.invalidate } } }),
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

/** Picks the best time from the keyboard, on the computer's grid. */
function pickBest() {
  const [grid] = screen.getAllByRole("group", { name: "Open times this week" });
  fireEvent.keyDown(grid!, { key: "ArrowDown" });
  return grid!;
}

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "Ana Lopez");
  await user.type(screen.getByLabelText("Email"), "ana@example.com");
  await user.type(screen.getByLabelText("What it's about"), "Planning");
  return user;
}

describe("booking on /meet", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows a slot in both zones and marks the best one", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    pickBest();
    expect(screen.getByText("11:00 AM PT for Chappy")).toBeTruthy();
    expect(screen.getByText("Best")).toBeTruthy();
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
    pickBest();
    expect(
      screen.getByRole("button", { name: "Book 15 minutes" }),
    ).toBeTruthy();
  });

  it("steps a week on a computer and 3 Days on a phone", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    expect(screen.getByRole("button", { name: "Earlier week" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Later days" }));
    expect(mocks.query).toHaveBeenLastCalledWith({
      slug: "meet",
      from: "2026-11-13",
    });
    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    expect(mocks.query).toHaveBeenLastCalledWith({
      slug: "meet",
      from: "2026-11-20",
    });
    fireEvent.click(screen.getByRole("button", { name: "Earlier week" }));
    fireEvent.click(screen.getByRole("button", { name: "Earlier week" }));
    expect(mocks.query).toHaveBeenLastCalledWith({
      slug: "meet",
      from: "2026-11-10",
    });
  });

  it("draws the phone's grid with the booker's clock alone", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    const [, phone] = screen.getAllByRole("group", {
      name: "Open times this week",
    });
    expect(phone).toBeTruthy();
    // Both grids label the booker's rail; only the computer's has Chappy's.
    expect(screen.getAllByText("ET")).toHaveLength(2);
    expect(screen.getAllByText("PT")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /your time/ })).toBeNull();
  });

  it("offers a length picker only when the link has several", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    expect(screen.getByRole("group", { name: "Length" })).toBeTruthy();
  });

  it("resizes the selection when the length changes", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    const grid = pickBest();
    // 9:00, then two quarter hours on: 9:30 PT, 12:30 PM for the booker.
    for (const key of ["Home", "ArrowDown", "ArrowDown"])
      fireEvent.keyDown(grid, { key });
    expect(screen.getByText("12:30 PM - 1:00 PM")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1 hour" }));
    // 9:30 PT can't hold an hour before 10, so the meeting slides to 9:00.
    expect(screen.getByRole("button", { name: "Book 1 hour" })).toBeTruthy();
    expect(screen.getByText("12:00 PM - 1:00 PM")).toBeTruthy();
    // The block on each grid, the computer's and the phone's.
    expect(screen.getAllByText("12:00-1:00 PM")).toHaveLength(2);
  });

  it("asks for another time when the slot was just taken", async () => {
    mocks.mutateAsync.mockResolvedValueOnce({
      ok: false,
      code: "taken",
      message: MESSAGES.taken,
    });
    render(<MeetBooking slug="meet" initial={PAGE} />);
    pickBest();
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
    pickBest();
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
    expect(document.body.textContent).toContain(
      "2:00 PM - 2:30 PM your time, ET",
    );
    expect(screen.getByText("11:00 AM - 11:30 AM PT for Chappy")).toBeTruthy();
    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(document.body.textContent).toContain("with the Google Meet link");
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

  it("moves a quarter hour, an hour, and across busy time", () => {
    const { group, onSelect } = strip(at(9, 15));
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith(at(9, 30));
    fireEvent.keyDown(group, { key: "ArrowDown", shiftKey: true });
    // Four starts on, across the busy hour; the spy leaves the prop at 9:15.
    expect(onSelect).toHaveBeenLastCalledWith(at(11, 30));
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(onSelect).toHaveBeenLastCalledWith(at(9));
    fireEvent.keyDown(group, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(at(11, 30));
  });

  it("moves to the same time on the next day, or the nearest open one", () => {
    const { group, onSelect } = strip(at(9, 15));
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith(at(10, 0, "2026-11-11"));
  });

  it("shows the host's clock beside the booker's", () => {
    strip(at(11));
    expect(screen.getByText("ET")).toBeTruthy();
    expect(screen.getByText("PT")).toBeTruthy();
    // A 30-minute block has room for the booker's start alone.
    expect(screen.getByText("2:00 PM")).toBeTruthy();
    expect(screen.queryByText("11:00 AM PT")).toBeNull();
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
    expect(screen.getByText("2:00-3:00 PM")).toBeTruthy();
    expect(screen.getByText("11:00 AM PT")).toBeTruthy();
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

  it("picks the time a tap lands on, and says so", () => {
    const { group, touch, onSelect, onPicked } = phone();
    // 11:30 PT on the first Day: the meeting centres on it, from 11:15.
    fireEvent.pointerDown(group, { ...touch, clientX: 50, clientY: 150 });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.pointerUp(group, { ...touch, clientX: 52, clientY: 151 });
    expect(onSelect).toHaveBeenCalledWith(at(11, 15));
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
    const { group, touch, onStep, onSelect } = phone();
    fireEvent.pointerDown(group, { ...touch, clientX: 150, clientY: 60 });
    fireEvent.pointerMove(group, { ...touch, clientX: 120, clientY: 62 });
    fireEvent.pointerMove(group, { ...touch, clientX: 70, clientY: 64 });
    fireEvent.pointerUp(group, { ...touch, clientX: 70, clientY: 64 });
    expect(onStep).toHaveBeenCalledWith(1);
    expect(onSelect).not.toHaveBeenCalled();

    // Nothing comes before the first Day.
    fireEvent.pointerDown(group, { ...touch, clientX: 50, clientY: 60 });
    fireEvent.pointerMove(group, { ...touch, clientX: 150, clientY: 60 });
    fireEvent.pointerUp(group, { ...touch, clientX: 150, clientY: 60 });
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("drags the meeting when the touch starts on it", () => {
    const { touch, onSelect, onPicked } = phone(at(11));
    const block = screen.getByText("2:00 PM");
    fireEvent.pointerDown(block, { ...touch, clientX: 50, clientY: 125 });
    fireEvent.pointerMove(block, { ...touch, clientX: 50, clientY: 140 });
    expect(onSelect).toHaveBeenLastCalledWith(at(11, 15));
    fireEvent.pointerUp(block, { ...touch, clientX: 50, clientY: 140 });
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("shows only the booker's rail", () => {
    phone();
    expect(screen.getByText("ET")).toBeTruthy();
    expect(screen.queryByText("PT")).toBeNull();
    expect(screen.queryByText("Chappy")).toBeNull();
  });
});
