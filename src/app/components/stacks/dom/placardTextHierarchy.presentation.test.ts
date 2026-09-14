import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const placard = read("./PlacardLayer.tsx");
const placardStatsCard = read("./PlacardStatsCard.tsx");
const blogPosts = read("../../BlogPosts.tsx");
const talkCard = read("../../TalkCard.tsx");
const subjectCards = read("./BookSubjectCards.tsx");

describe("placard text hierarchy", () => {
  it("defaults readable content to foreground instead of treating every card as metadata", () => {
    expect(placard).toContain(
      'className="stacks-placard-layer font-serif text-foreground"',
    );
    expect(placard).not.toContain(
      'className="stacks-placard-layer font-serif text-muted-foreground"',
    );
    expect(placard).not.toContain("font-serif text-muted-foreground");
  });

  it("keeps dates and durations equally faint while preserving readable card text", () => {
    expect(placard).not.toContain("text-muted-foreground/70");
    expect(placard).not.toContain("text-muted-foreground/50");
    for (const card of [blogPosts, talkCard]) {
      expect(card).toContain("homepage-card-meta text-muted-foreground opacity-60");
      expect(card).toContain('className="mt-1 line-clamp-2 homepage-card-body"');
    }
    expect(talkCard).toContain("homepage-card-meta font-semibold text-muted-foreground");
    expect(talkCard).not.toContain("text-foreground opacity-70");
  });

  it("stabilizes text contrast over every photographed backdrop", () => {
    expect(placardStatsCard.match(/bg-muted\/90/g)).toHaveLength(2);
    expect(placardStatsCard).not.toContain("bg-muted/40");
  });

  it("keeps subject text theme-aware over tinted glass", () => {
    expect(placard).toContain("Favorite subjects");
    expect(placard).not.toContain("Library by subject");
    expect(subjectCards).toContain("${colors.bg} 65%, transparent");
    expect(subjectCards).toContain("text-foreground");
  });
});
