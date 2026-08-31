import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sortSource = readFileSync(
  new URL("./BookSort.tsx", import.meta.url),
  "utf8",
);
const detailSource = readFileSync(
  new URL("./BookDetailContent.tsx", import.meta.url),
  "utf8",
);

describe("book metadata icons", () => {
  it("uses the blank calendar for publication dates", () => {
    expect(sortSource).toMatch(
      /field: "publicationYear", label: "Published", icon: CalendarBlankIcon/,
    );
    expect(detailSource).toMatch(
      /key="published"[\s\S]*?icon=\{<CalendarBlankIcon size=\{14\} weight="bold" \/>\}/,
    );
  });

  it("uses the read-date clock for completed readings", () => {
    expect(sortSource).toMatch(
      /field: "finished", label: "Read Date", icon: ClockIcon/,
    );
    expect(detailSource).toMatch(
      /key="read"[\s\S]*?icon=\{<ClockIcon size=\{14\} weight="bold" \/>\}/,
    );
    expect(detailSource).toMatch(
      /index > 0[\s\S]*?<ArrowsClockwiseIcon[\s\S]*?: \([\s\S]*?<ClockIcon/,
    );
  });
});
