import { ROOM_OG_CARDS } from "../../scripts/generate/room-og-config.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as golfCard from "./golf/opengraph-image";
import * as musingsCard from "./musings/opengraph-image";
import * as homeCard from "./opengraph-image";
import * as projectsCard from "./projects/opengraph-image";
import { ROOM_OG_SCENES } from "./roomOgCard";
import * as talksCard from "./talks/opengraph-image";

const routes = {
  home: homeCard,
  projects: projectsCard,
  musings: musingsCard,
  talks: talksCard,
  golf: golfCard,
};

describe("room OG cards", () => {
  // The generator writes the stills and the routes read them; one table on
  // each side, so pin them to each other.
  it("reads each still from where the generator writes it", () => {
    expect(`public/${ROOM_OG_SCENES.home}`).toBe(ROOM_OG_CARDS.about.image);
    for (const slug of ["projects", "musings", "talks", "golf"] as const) {
      expect(`public/${ROOM_OG_SCENES[slug]}`).toBe(ROOM_OG_CARDS[slug].image);
    }
    for (const file of Object.values(ROOM_OG_SCENES)) {
      expect(existsSync(join(process.cwd(), "public", file))).toBe(true);
    }
  });

  it("names each card for its page", () => {
    expect(homeCard.alt).toBe("Chappy Asel");
    expect(projectsCard.alt).toBe("Chappy's Projects");
    expect(musingsCard.alt).toBe("Chappy's Musings");
    expect(talksCard.alt).toBe("Chappy's Featured Talks");
    expect(golfCard.alt).toBe("Chappy's Golf");
  });

  it("renders every card as a 1200 by 630 PNG with its still inside", async () => {
    for (const [scene, route] of Object.entries(routes)) {
      expect(route.size).toEqual({ width: 1200, height: 630 });
      const response = await route.default();
      expect(response.headers.get("content-type")).toBe(route.contentType);
      const png = Buffer.from(await response.arrayBuffer());
      expect(png.readUInt32BE(16), scene).toBe(1200);
      expect(png.readUInt32BE(20), scene).toBe(630);
      // The signature over a bare background is about 21 KB. A card with
      // its scene still behind it is several times that.
      expect(png.byteLength, scene).toBeGreaterThan(200_000);
    }
  }, 60_000);
});
