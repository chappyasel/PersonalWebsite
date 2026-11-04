import { describe, expect, it } from "vitest";

import {
  bareClockLabel,
  clockLabel,
  compactRangeLabel,
  dateLabel,
  dayLabel,
  hourLabel,
  minutesIntoDate,
  offsetMinutes,
  rangeLabel,
  sameClock,
  slotSentence,
  slotText,
  zoneCity,
  zoneLabel,
  zonedDate,
  zonedTime,
} from "./zones";

const PT = "America/Los_Angeles";
const ET = "America/New_York";
// Tue Nov 10 2026, 11:00 AM in San Francisco (PST, UTC-8).
const ELEVEN_PT = Date.UTC(2026, 10, 10, 19);

describe("reading a moment in a zone", () => {
  it("finds the wall clock and the date", () => {
    expect(clockLabel(ELEVEN_PT, PT)).toBe("11:00 AM");
    expect(clockLabel(ELEVEN_PT, ET)).toBe("2:00 PM");
    expect(clockLabel(ELEVEN_PT, "Asia/Kolkata")).toBe("12:30 AM");
    expect(zonedDate(ELEVEN_PT, "Asia/Kolkata")).toBe("2026-11-11");
    expect(minutesIntoDate(ELEVEN_PT, PT)).toBe(11 * 60);
  });

  it("reads noon and midnight on a 12-hour clock", () => {
    expect(clockLabel(Date.UTC(2026, 10, 10, 20), PT)).toBe("12:00 PM");
    expect(clockLabel(Date.UTC(2026, 10, 10, 8), PT)).toBe("12:00 AM");
  });

  it("writes the schedule's short hour labels", () => {
    expect(hourLabel(Date.UTC(2026, 10, 10, 17), PT)).toBe("9a");
    expect(hourLabel(Date.UTC(2026, 10, 10, 20), PT)).toBe("12p");
    expect(hourLabel(Date.UTC(2026, 10, 10, 8), PT)).toBe("12a");
    expect(hourLabel(Date.UTC(2026, 10, 10, 0), PT)).toBe("4p");
    expect(hourLabel(ELEVEN_PT, "Asia/Kolkata")).toBe("12:30a");
    expect(bareClockLabel(ELEVEN_PT, ET)).toBe("2:00");
  });

  it("writes a narrow range with one AM or PM when it can", () => {
    expect(compactRangeLabel(ELEVEN_PT, ELEVEN_PT + 45 * 60_000, PT)).toBe(
      "11:00-11:45 AM",
    );
    expect(compactRangeLabel(ELEVEN_PT, ELEVEN_PT + 90 * 60_000, PT)).toBe(
      "11:00 AM-12:30 PM",
    );
  });

  it("knows each zone's offset, daylight saving included", () => {
    expect(offsetMinutes(ELEVEN_PT, PT)).toBe(-480);
    expect(offsetMinutes(Date.UTC(2026, 6, 1), PT)).toBe(-420);
    expect(offsetMinutes(ELEVEN_PT, "Asia/Kolkata")).toBe(330);
  });

  it("turns a Day's wall clock back into a moment", () => {
    expect(zonedTime("2026-11-10", 11 * 60, PT)).toBe(ELEVEN_PT);
    // Summer time, an hour less behind UTC.
    expect(zonedTime("2026-07-01", 9 * 60, PT)).toBe(Date.UTC(2026, 6, 1, 16));
    // The fall-back Sunday: 9 AM comes after the repeated hour.
    expect(zonedTime("2026-11-01", 9 * 60, PT)).toBe(Date.UTC(2026, 10, 1, 17));
    // Past midnight runs into the next date.
    expect(zonedTime("2026-11-10", 25 * 60, PT)).toBe(
      Date.UTC(2026, 10, 11, 9),
    );
  });

  it("calls two zones the same clock by offset, not by name", () => {
    expect(sameClock(ELEVEN_PT, ET, "America/Detroit")).toBe(true);
    expect(sameClock(ELEVEN_PT, PT, ET)).toBe(false);
  });
});

describe("labels", () => {
  it("writes dates in the site's style", () => {
    expect(dateLabel("2026-11-01")).toBe("Nov 1st");
    expect(dateLabel("2026-11-12")).toBe("Nov 12th");
    expect(dateLabel("2026-11-22")).toBe("Nov 22nd");
    expect(dayLabel("2026-11-10")).toBe("Tue, Nov 10th");
    expect(rangeLabel("2026-11-09", "2026-11-15")).toBe("Nov 9th-15th");
    expect(rangeLabel("2026-11-30", "2026-12-06")).toBe("Nov 30th-Dec 6th");
  });

  it("names zones the way people say them", () => {
    expect(zoneLabel(ELEVEN_PT, PT)).toBe("PT");
    expect(zoneLabel(ELEVEN_PT, ET)).toBe("ET");
    expect(zoneLabel(ELEVEN_PT, "Asia/Kolkata")).toBe("GMT+5:30");
    expect(zoneLabel(ELEVEN_PT, "UTC")).toBe("GMT");
    expect(zoneCity(PT)).toBe("San Francisco");
    expect(zoneCity("America/New_York")).toBe("New York");
  });
});

describe("a slot on both clocks", () => {
  const end = ELEVEN_PT + 30 * 60_000;

  it("gives each side its own day, times, and zone", () => {
    const text = slotText(ELEVEN_PT, end, PT, ET);
    expect(text.booker).toMatchObject({
      day: "Tue, Nov 10th",
      start: "2:00 PM",
      end: "2:30 PM",
      zone: "ET",
    });
    expect(text.host).toMatchObject({ start: "11:00 AM", zone: "PT" });
    expect(text.sameClock).toBe(false);
    expect(text.dateDiffers).toBe(false);
    expect(slotSentence(text, "Chappy")).toBe(
      "Tue, Nov 10th, 2:00 PM to 2:30 PM your time (11:00 AM PT for Chappy)",
    );
  });

  it("names the host's day when the dates differ", () => {
    const text = slotText(ELEVEN_PT, end, PT, "Asia/Tokyo");
    expect(text.dateDiffers).toBe(true);
    expect(slotSentence(text, "Chappy")).toBe(
      "Wed, Nov 11th, 4:00 AM to 4:30 AM your time (Tue, Nov 10th, 11:00 AM PT for Chappy)",
    );
  });

  it("says it once when both clocks agree", () => {
    const text = slotText(ELEVEN_PT, end, PT, "US/Pacific");
    expect(text.sameClock).toBe(true);
    expect(slotSentence(text, "Chappy")).toBe(
      "Tue, Nov 10th, 11:00 AM to 11:30 AM your time",
    );
  });
});
