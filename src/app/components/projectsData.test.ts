import projectsData from "../../../public/data/projects.json";
import { describe, expect, it } from "vitest";

describe("projects data", () => {
  it("leads with the two shipped apps", () => {
    expect(
      projectsData.projects.slice(0, 2).map((project) => project.name),
    ).toEqual(["Weightlifting App", "Homework App"]);
    expect(projectsData.projects[0]?.link).toBe(
      "https://apps.apple.com/us/app/id1266077653",
    );
    // The App Store listing is gone since the acquisition; the card stays
    // unlinked rather than pointing at a dead page.
    expect(projectsData.projects[1]).not.toHaveProperty("link");
  });

  it("gives every project an image path, a meta line, and prose without dashes", () => {
    for (const project of projectsData.projects) {
      expect(project.image, project.name).toMatch(/^\/images\//);
      expect(project.meta, project.name).not.toBe("");
      expect(project.description, project.name).not.toMatch(/[—–]/);
      expect(project.meta, project.name).not.toMatch(/[—–]/);
    }
  });

  it("names GitHub repositories as owner/name so the live lists can exclude them", () => {
    const repos = projectsData.projects.flatMap((project) =>
      "repo" in project ? [project.repo] : [],
    );
    expect(repos).toEqual([
      "chappyasel/meta-kb",
      "chappyasel/PersonalWebsite",
    ]);
    for (const repo of repos) expect(repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
  });
});
