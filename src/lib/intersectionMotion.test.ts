import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const providers = readFileSync(
  new URL("./providers.tsx", import.meta.url),
  "utf8",
);

describe("intersection motion hydration", () => {
  it("does not mutate every matching element from the root provider", () => {
    expect(providers).not.toContain("tailwindcss-intersect");
    expect(providers).not.toContain("Observer.start()");
  });

  it("starts observation from a post-hydration component effect", () => {
    const source = readFileSync(
      new URL("../components/ui/intersection-motion.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("useEffect");
    expect(source).toContain("new IntersectionObserver");
    expect(source).not.toContain("document.querySelectorAll");
  });
});
