import fs from "node:fs";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./About.tsx", import.meta.url), "utf8");

describe("About presentation", () => {
  it("excludes the homework-planner claim from search snippets", () => {
    const excludedText = /<span data-nosnippet="">([\s\S]*?)<\/span>/.exec(
      source,
    )?.[1];

    expect(excludedText).toContain("#1 homework planner in the world");
  });
});
