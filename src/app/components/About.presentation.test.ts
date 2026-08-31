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

  it("links the current bio to its related pages and organizations", () => {
    expect(source).toContain('href="https://tjpartnershipfund.org/"');
    expect(source).toContain('href="https://books.chappyasel.com"');
    expect(source).toContain('href="https://weightlifting.chappyasel.com"');
    expect(source).toContain('href="https://worldnaturalbb.com/"');
    expect(source).toContain('unit="systems"');
    expect(source).toContain('unit="blog"');
    expect(source).toContain('unit="talks"');
  });
});
