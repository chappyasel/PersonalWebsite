import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const placard = read("./PlacardLayer.tsx");
const placardStatsCard = read("./PlacardStatsCard.tsx");
const blogPosts = read("../../BlogPosts.tsx");
const talkCard = read("../../TalkCard.tsx");

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

  it("keeps genuine metadata muted without additional opacity dilution", () => {
    expect(placard).not.toContain("text-muted-foreground/70");
    expect(placard).not.toContain("text-muted-foreground/50");
    expect(blogPosts).toContain(
      '<p className="text-xs font-semibold text-muted-foreground">',
    );
    expect(talkCard).toContain("text-xs font-semibold text-muted-foreground");
    expect(talkCard).not.toContain("text-foreground opacity-70");
  });

  it("stabilizes text contrast over every photographed backdrop", () => {
    expect(placardStatsCard.match(/bg-muted\/90/g)).toHaveLength(2);
    expect(placardStatsCard).not.toContain("bg-muted/40");
    expect(placard).toContain(
      'className="mt-1 block text-[9px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground"',
    );
    expect(placard).not.toContain("tracking-[0.08em] opacity-60");
  });

  it("gives the subject library an opaque, light theme surface", () => {
    expect(placard).toContain("Books by subject");
    expect(placard).not.toContain("Library by subject");
    expect(placard).toContain(
      "backgroundColor: `color-mix(in srgb, hsl(var(--card)) 86%, ${colors.fg} 14%)`",
    );
    expect(placard).not.toContain(
      "backgroundColor: `color-mix(in srgb, ${colors.fg} 14%, transparent)`",
    );
  });
});
