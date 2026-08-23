import { describe, expect, it } from "vitest";

import { createServerExcerpt } from "./excerpt";

describe("createServerExcerpt", () => {
  it("returns plain text near the match and strips executable HTML", () => {
    const excerpt = createServerExcerpt(
      "# Heading\n<script>alert('private')</script>&lt;img src=x onerror=steal()&gt;Before the **decision** after it.",
      "decision",
    );

    expect(excerpt).toContain("decision");
    expect(excerpt).not.toMatch(/script|alert|onerror|<|>/i);
  });

  it("clips by Unicode code points without creating replacement characters", () => {
    const excerpt = createServerExcerpt(
      `${"🧠".repeat(230)} important phrase ${"📚".repeat(230)}`,
      "important",
    );

    expect(Array.from(excerpt).length).toBeLessThanOrEqual(220);
    expect(excerpt).toContain("important");
    expect(excerpt).not.toContain("�");
  });
});
