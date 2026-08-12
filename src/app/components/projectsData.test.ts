import projectsData from "../../../public/data/projects.json";
import { describe, expect, it } from "vitest";

describe("featured project order", () => {
  it("starts with Weightlifting, Liar's Dice, then the unlinked Homework App", () => {
    expect(
      projectsData.projects.slice(0, 3).map((project) => project.name),
    ).toEqual(["Weightlifting App", "Liar's Dice", "Homework App (Acquired)"]);
    expect(projectsData.projects[0]?.link).toBe(
      "https://apps.apple.com/us/app/id1266077653",
    );
    expect(projectsData.projects[1]?.link).toBe("/liarsdice");
    expect(projectsData.projects[2]).not.toHaveProperty("link");
  });
});
