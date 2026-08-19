import fs from "node:fs";
import { describe, expect, it } from "vitest";

const primitivesSource = fs.readFileSync(
  new URL("./primitives.tsx", import.meta.url),
  "utf8",
);
const objectsSource = fs.readFileSync(
  new URL("./objects.tsx", import.meta.url),
  "utf8",
);

describe("graspable external destinations", () => {
  it("registers project frames as external Doors while retaining onTap", () => {
    const start = primitivesSource.indexOf("hoverKey={`grab:frame:${key}`}");
    const carrier = primitivesSource.slice(start, start + 500);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(carrier).toContain("onTap=");
    expect(carrier).toContain("href={href}");
    expect(carrier).toContain("external");
  });

  it("registers linked notebooks as external Doors while retaining onTap", () => {
    const start = objectsSource.indexOf("onTap={key ?");
    const carrier = objectsSource.slice(Math.max(0, start - 300), start + 500);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(carrier).toContain("href={key}");
    expect(carrier).toContain("external");
  });
});
