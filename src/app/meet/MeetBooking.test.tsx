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
    const best = screen.getByRole("button", {
      name: "2:00 PM your time, 11:00 AM for Chappy, best",
    });
    fireEvent.click(best);
    expect(best.getAttribute("aria-pressed")).toBe("true");
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
    fireEvent.click(screen.getByRole("button", { name: /^2:00 PM your time/ }));
    expect(
      screen.getByRole("button", { name: "Book 15 minutes" }),
    ).toBeTruthy();
  });

  it("offers a length picker only when the link has several", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    expect(screen.getByRole("group", { name: "Length" })).toBeTruthy();
  });

  it("resizes the selection when the length changes", () => {
    render(<MeetBooking slug="meet" initial={PAGE} />);
    fireEvent.click(
      screen.getByRole("button", { name: /^12:30 PM your time/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1 hour" }));
    // 9:30 PT can't hold an hour before 10, so the meeting slides to 9:00.
    expect(screen.getByRole("button", { name: "Book 1 hour" })).toBeTruthy();
    expect(screen.getAllByText("12:00 PM - 1:00 PM").length).toBeGreaterThan(0);
    expect(
      screen
        .getByRole("button", { name: /^12:00 PM your time/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("asks for another time when the slot was just taken", async () => {
    mocks.mutateAsync.mockResolvedValueOnce({
      ok: false,
      code: "taken",
      message: MESSAGES.taken,
    });
    render(<MeetBooking slug="meet" initial={PAGE} />);
    fireEvent.click(screen.getByRole("button", { name: /^2:00 PM your time/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /^2:00 PM your time/ }));
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
