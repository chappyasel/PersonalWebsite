import snapshot from "../../../public/data/github.json";
import { describe, expect, it } from "vitest";

import { gitHubActivitySchema } from "./types";

describe("committed GitHub snapshot", () => {
  it("parses against the activity schema with a full calendar", () => {
    const activity = gitHubActivitySchema.parse(snapshot);
    expect(activity.login).toBe("chappyasel");
    expect(activity.contributions.days.length).toBeGreaterThanOrEqual(364);
    expect(activity.repos.length).toBeGreaterThan(0);
    expect(activity.years[0]?.year).toBe(2015);
    expect(activity.years.at(-1)?.year).toBeGreaterThanOrEqual(2026);
  });

  it("carries no repository visibility flag, so nothing private can slip through", () => {
    expect(JSON.stringify(snapshot)).not.toContain("isPrivate");
  });
});
