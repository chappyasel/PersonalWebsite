import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";

import { rehypeBookHeadingAnchors } from "./headingAnchors";
import { renderableNotes, withoutPlaceholders } from "./markdown";
import { chunkBookNotes } from "./noteChunks";

/** The ids the book page renders for these notes. */
function renderedIds(notes: string): string[] {
  const html = renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeBookHeadingAnchors]}
    >
      {renderableNotes(withoutPlaceholders(notes))}
    </ReactMarkdown>,
  );
  return [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]!);
}

const NOTES = [
  "# **Summary**",
  "",
  "Trust is built by acting consistently.",
  "",
  "> *“Trust is built by acting in a way consistent with one's values”*",
  "",
  "# **Key Takeaways**",
  "",
  "<details>",
  "<summary>Build **trusting teams** before expecting performance</summary>",
  "- Navy SEALs rank on performance and trust",
  "- Leaders take the first step",
  "",
  "</details>",
  "",
  "# **Notes**",
  "",
  "### 1: The cult of the head start",
  "",
  "- Repetition does not cause learning",
  "    - Chess is the exception",
  "",
  "**2: When less of the same is more**",
  "",
  "1. Sampling before specializing",
  "2. Diversity while young",
].join("\n");

describe("chunkBookNotes", () => {
  it("splits notes into one passage per section, toggle, and chapter", () => {
    expect(chunkBookNotes(NOTES)).toEqual([
      {
        section: "Summary",
        heading: null,
        anchor: "summary",
        text: [
          "Trust is built by acting consistently.",
          "> “Trust is built by acting in a way consistent with one's values”",
        ].join("\n"),
      },
      {
        section: "Key Takeaways",
        heading: "Build trusting teams before expecting performance",
        anchor: "key-takeaways",
        text: "- Navy SEALs rank on performance and trust\n- Leaders take the first step",
      },
      {
        section: "Notes",
        heading: "1: The cult of the head start",
        anchor: "1-the-cult-of-the-head-start",
        text: "- Repetition does not cause learning\n  - Chess is the exception",
      },
      {
        section: "Notes",
        heading: "2: When less of the same is more",
        anchor: "2-when-less-of-the-same-is-more",
        text: "1. Sampling before specializing\n2. Diversity while young",
      },
    ]);
  });

  it("links every passage to an id the book page renders", () => {
    const ids = renderedIds(NOTES);
    expect(ids).toContain("2-when-less-of-the-same-is-more");
    for (const chunk of chunkBookNotes(NOTES))
      expect(ids).toContain(chunk.anchor);
  });

  it("anchors bold chapter labels in the same id set as headings", () => {
    const notes = "# Notes\n\n**Notes**\n\n- first\n\n## Notes\n\n- second";
    expect(renderedIds(notes)).toEqual(["notes", "notes-2", "notes-3"]);
    expect(chunkBookNotes(notes).map((chunk) => chunk.anchor)).toEqual([
      "notes-2",
      "notes-3",
    ]);
  });

  it("leaves paragraphs that only start in bold unanchored", () => {
    expect(renderedIds("**Will** matters more than resources")).toEqual([]);
  });

  it("returns nothing for a skeleton nobody has filled in", () => {
    const skeleton = [
      "# Summary",
      "",
      "Todo",
      "",
      "# Key Takeaways",
      "",
      "- Todo",
      "",
      "# Notes",
      "",
      "**1: Introduction**",
      "",
      "-",
    ].join("\n");
    expect(chunkBookNotes(skeleton)).toEqual([]);
  });

  it("splits a long chapter at line boundaries", () => {
    const bullets = Array.from(
      { length: 80 },
      (_, index) => `- Bullet ${index} ${"word ".repeat(10)}`,
    );
    const chunks = chunkBookNotes(`## Long chapter\n\n${bullets.join("\n")}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(3000);
      expect(chunk.heading).toBe("Long chapter");
      expect(chunk.text.startsWith("- Bullet")).toBe(true);
    }
  });
});
