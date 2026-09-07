import { describe, expect, it } from "vitest";

import {
  type PublicIndexSourceTexts,
  createPublicSearchIndex,
  extractNotionBlockText,
} from "./public-index-generation";

const sources: PublicIndexSourceTexts = {
  manual: JSON.stringify({
    sections: [
      {
        id: "working-together",
        title: "Working Together",
        blocks: [
          {
            type: "paragraph",
            content: [{ text: "Start with context." }],
          },
        ],
      },
    ],
  }),
  routine: JSON.stringify({
    whyEarly: [{ type: "quote", content: [{ text: "Quiet mornings" }] }],
    timeline: {
      am: [
        {
          time: "5:00am",
          title: "Write",
          blocks: [{ type: "image", src: "/write.png", alt: "Notebook" }],
        },
      ],
      pm: [],
    },
    supplements: {
      am: [
        {
          name: "Creatine",
          dosage: "5g",
          benefits: "Strength",
          costPerDay: "$0.10",
        },
      ],
      pm: [],
    },
    rants: [
      {
        id: "sleep",
        title: "Sleep",
        blocks: [{ type: "paragraph", content: [{ text: "Eight hours" }] }],
      },
    ],
  }),
  systems: JSON.stringify({
    intro: [],
    sections: [
      {
        id: "at-a-glance",
        title: "At a Glance",
        blocks: [{ type: "paragraph", content: [{ text: "Seven layers." }] }],
      },
      {
        id: "the-seven-layers",
        title: "The Seven Layers",
        layers: [
          {
            id: "execution-systems",
            title: "Execution Systems",
            blocks: [
              {
                type: "toggle",
                title: [
                  { text: ":sunsama:", customEmoji: { name: "sunsama", src: "/e.png" } },
                  { text: " Sunsama → tasks / calendar" },
                ],
                children: [
                  { type: "paragraph", content: [{ text: "Time blocking." }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  }),
  blog: JSON.stringify({
    items: [
      {
        title: "A useful essay",
        link: "https://example.com/essay",
        description: "Stored Medium description",
      },
    ],
  }),
  projects: JSON.stringify({
    projects: [
      {
        name: "Linked project",
        link: "/liarsdice",
        image: "/images/stacks/v8/512/projects-icon.webp",
        languages: ["React", "TypeScript"],
        description: "A probability tool",
      },
      {
        name: "Captured project",
        link: "/liarsdice",
        image: "capture.png",
        languages: ["React"],
        description: "An old capture",
      },
      {
        name: "Escaping image project",
        link: "/liarsdice",
        image: "//example.com/escape.png",
        languages: ["React"],
        description: "Its image must not leave the origin",
      },
      {
        name: "Unavailable project",
        languages: ["Swift"],
        description: "No destination",
      },
      {
        name: "YouTube project",
        link: "https://youtube.com/watch?v=excluded",
        languages: ["Video"],
        description: "Must be excluded",
      },
      {
        name: "Protocol-relative project",
        link: "//example.com/escape",
        languages: ["HTML"],
        description: "Must not escape the site origin",
      },
    ],
  }),
};

describe("extractNotionBlockText", () => {
  it("extracts every rendered nested block type, including image alt text", () => {
    const text = extractNotionBlockText([
      { type: "paragraph", content: [{ text: "Paragraph" }] },
      { type: "heading", level: 3, content: [{ text: "Heading" }] },
      { type: "quote", content: [{ text: "Quote" }] },
      {
        type: "callout",
        icon: "!",
        color: "blue",
        content: [{ type: "paragraph", content: [{ text: "Callout" }] }],
      },
      {
        type: "toggle",
        title: [{ text: "Toggle" }],
        children: [{ type: "image", src: "/image.png", alt: "Diagram alt" }],
      },
      {
        type: "bulleted_list",
        items: [
          [{ type: "paragraph", content: [{ text: "Bullet one" }] }],
          [
            { type: "paragraph", content: [{ text: "Bullet two" }] },
            {
              type: "numbered_list",
              items: [
                [{ type: "paragraph", content: [{ text: "Nested number" }] }],
              ],
            },
          ],
        ],
      },
      {
        type: "table",
        headers: ["Name", "Value"],
        rows: [{ Name: { text: "Sleep" }, Value: { text: "8 hours" } }],
      },
      { type: "divider" },
    ]);

    expect(text).toBe(
      "Paragraph Heading Quote Callout Toggle Diagram alt Bullet one Bullet two Nested number Name Value Sleep 8 hours",
    );
  });
});

describe("createPublicSearchIndex", () => {
  it("is deterministic and detects any source file changing", () => {
    const first = createPublicSearchIndex(sources);
    const second = createPublicSearchIndex({ ...sources });
    const changed = createPublicSearchIndex({
      ...sources,
      projects: sources.projects.replace("Linked project", "Changed project"),
    });

    expect(second).toEqual(first);
    expect(changed.sourceDigest).not.toBe(first.sourceDigest);
  });

  it("builds routable documents and omits records without a destination", () => {
    const index = createPublicSearchIndex(sources);

    expect(index.version).toBe(1);
    expect(index.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "public:manual:working-together",
          source: "manual",
          label: "Working Together",
          target: { kind: "site", site: "manual", hash: "working-together" },
          body: "Start with context.",
        }),
        expect.objectContaining({
          id: "public:routine:timeline:am:write",
          source: "routine",
          label: "Write",
          target: { kind: "site", site: "routine", hash: "morning" },
          metadata: ["5:00am", "Morning"],
          body: "Notebook",
        }),
        expect.objectContaining({
          id: "public:systems:at-a-glance",
          source: "systems",
          label: "At a Glance",
          target: { kind: "site", site: "home", path: "/systems", hash: "at-a-glance" },
          body: "Seven layers.",
        }),
        expect.objectContaining({
          id: "public:systems:execution-systems",
          label: "Execution Systems",
          metadata: ["The Seven Layers"],
        }),
        expect.objectContaining({
          id: "public:systems:execution-systems:sunsama",
          source: "systems",
          label: "Sunsama",
          target: {
            kind: "site",
            site: "home",
            path: "/systems",
            hash: "execution-systems",
          },
          metadata: ["Execution Systems"],
          body: "tasks / calendar Time blocking.",
        }),
        expect.objectContaining({
          id: "public:project:linked-project",
          source: "project",
          label: "Linked project",
          target: { kind: "site", site: "home", path: "/liarsdice" },
          image: "/images/stacks/v8/512/projects-icon.webp",
        }),
        expect.objectContaining({
          id: "public:project:captured-project",
          image: "/images/projects/capture.png",
        }),
      ]),
    );
    const escaping = index.documents.find(
      (document) => document.id === "public:project:escaping-image-project",
    );
    expect(escaping).toBeDefined();
    expect(escaping).not.toHaveProperty("image");
    expect(
      index.documents.some(
        (document) => document.label === "Unavailable project",
      ),
    ).toBe(false);
  });

  it("removes every YouTube destination", () => {
    const serialized = JSON.stringify(createPublicSearchIndex(sources));

    expect(serialized).not.toMatch(/youtube|youtu\.be/i);
    expect(serialized).not.toContain("YouTube project");
    expect(serialized).not.toContain("Protocol-relative project");
  });
});
