import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MeetPage from "./page";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock("~/env", () => ({ env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site" } }));
vi.mock("~/server/booking/daybreak", () => ({
  bookingConfig: () => ({}),
  readBookingPage: mocks.read,
}));
vi.mock("./MeetBooking", () => ({
  MeetBooking: ({ turnstileSiteKey }: { turnstileSiteKey?: string }) => (
    <p>Picker with {turnstileSiteKey}</p>
  ),
}));

describe("/meet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says booking isn't open without a deployment", async () => {
    mocks.read.mockResolvedValue({ status: "closed" });
    const html = renderToStaticMarkup(await MeetPage());
    expect(html).toContain("Booking isn&#x27;t open right now.");
    expect(html).not.toContain("Picker");
  });

  it("says the calendar didn't answer when the deployment is down", async () => {
    mocks.read.mockResolvedValue({ status: "unavailable" });
    expect(renderToStaticMarkup(await MeetPage())).toContain(
      "didn&#x27;t answer",
    );
  });

  it("draws the picker with the link's title and the Turnstile site key", async () => {
    mocks.read.mockResolvedValue({
      status: "open",
      page: { link: { title: "Meet with Chappy", host: "Chappy" } },
    });
    const html = renderToStaticMarkup(await MeetPage());
    expect(html).toContain("<h1");
    expect(html).toContain("Meet with Chappy");
    expect(html).toContain("Picker with site");
    expect(html).toContain("Times show in your zone and Chappy&#x27;s.");
  });

  it("draws in Daybreak's look, not the site's", async () => {
    mocks.read.mockResolvedValue({
      status: "open",
      page: { link: { title: "Meet with Chappy", host: "Chappy" } },
    });
    const html = renderToStaticMarkup(await MeetPage());
    expect(html).toContain('class="meet-root"');
    expect(html).not.toMatch(/dl-|daylight/);
  });
});
