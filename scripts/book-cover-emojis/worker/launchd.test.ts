import { BATCH_LIMIT, INTERVAL_SECONDS, LABEL, buildPlist } from "./launchd";
import { describe, expect, it } from "vitest";

const plist = buildPlist({
  repoRoot: "/Users/someone/Repos/PersonalWebsite",
  pnpmPath: "/opt/homebrew/bin/pnpm",
  nodeDir: "/opt/homebrew/bin",
});

describe("the launchd plist", () => {
  it("uses absolute paths, because launchd has no shell or PATH", () => {
    expect(plist).toContain("<string>/opt/homebrew/bin/pnpm</string>");
    expect(plist).toContain("<string>/Users/someone/Repos/PersonalWebsite</string>");
    expect(plist).not.toMatch(/<string>pnpm<\/string>/);
  });

  it("runs a bounded batch rather than the whole catalog", () => {
    expect(plist).toContain("<string>--limit</string>");
    expect(plist).toContain(`<string>${BATCH_LIMIT}</string>`);
    expect(plist).toContain(`<integer>${INTERVAL_SECONDS}</integer>`);
  });

  it("does not fire the moment it is loaded", () => {
    expect(plist).toContain("<key>RunAtLoad</key>\n  <false/>");
  });

  it("logs under the local state root", () => {
    expect(plist).toMatch(/Desktop\/Agents\/book-cover-emojis\/logs\/worker\.out\.log/);
    expect(plist).toMatch(/Desktop\/Agents\/book-cover-emojis\/logs\/worker\.err\.log/);
  });

  it("carries no secret of any kind", () => {
    for (const pattern of [/ntn_/, /secret_/, /NOTION_API_KEY/, /AWS_SECRET/, /postgres:\/\//]) {
      expect(plist).not.toMatch(pattern);
    }
    // The only environment it sets is PATH.
    const envBlock = plist.slice(plist.indexOf("EnvironmentVariables"), plist.indexOf("StartInterval"));
    expect(envBlock.match(/<key>/g)).toHaveLength(2);
  });

  it("is well-formed enough for plutil and uniquely labelled", () => {
    expect(plist.startsWith('<?xml version="1.0"')).toBe(true);
    expect(plist.trimEnd().endsWith("</plist>")).toBe(true);
    expect(plist).toContain(`<string>${LABEL}</string>`);
  });
});

describe("staging rather than installing", () => {
  it("keeps the plist out of LaunchAgents until asked", async () => {
    // A plist in ~/Library/LaunchAgents is not inert: a later login can load
    // it, which would start a mutating job without the explicit activation
    // this is supposed to require.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("scripts/book-cover-emojis/worker/launchd.ts", "utf8"),
    );
    expect(source).toContain("const stagedPath");
    expect(source).toMatch(/case "stage"/);
    // Only the deliberate install path writes into LaunchAgents.
    const installBlock = source.slice(source.indexOf('case "install"'), source.indexOf('case "uninstall"'));
    expect(installBlock).toContain("installedPath");
    const stageBlock = source.slice(source.indexOf('case "stage"'), source.indexOf('case "install"'));
    expect(stageBlock).not.toContain("installedPath");
  });

  it("unloads before removing, and verifies", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("scripts/book-cover-emojis/worker/launchd.ts", "utf8"),
    );
    const uninstall = source.slice(source.indexOf('case "uninstall"'), source.indexOf('case "status"'));
    expect(uninstall).toContain("unload()");
    expect(uninstall).toContain("isLoaded()");
    expect(uninstall.indexOf("unload()")).toBeLessThan(uninstall.indexOf("rmSync(installedPath"));
  });

  it("still never loads the job itself", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("scripts/book-cover-emojis/worker/launchd.ts", "utf8"),
    );
    expect(source).not.toMatch(/execFileSync\([^)]*"load"/);
    expect(source).toContain("launchctl load -w");
  });
});

describe("what install actually promises", () => {
  const read = async () =>
    (await import("node:fs")).readFileSync(
      "scripts/book-cover-emojis/worker/launchd.ts",
      "utf8",
    );

  it("says installing hands the job to an auto-load directory", async () => {
    // The old copy claimed a login would not start it, which was wrong and
    // undercut the reason staging exists.
    const source = await read();
    const install = source.slice(
      source.indexOf('case "install"'),
      source.indexOf('case "uninstall"'),
    );
    expect(install).toMatch(/auto-load directory/);
    expect(install).toMatch(/next login/);
    expect(install).not.toMatch(/will not start/);
  });

  it("says staging puts it somewhere nothing can start it", async () => {
    const source = await read();
    const stage = source.slice(
      source.indexOf('case "stage"'),
      source.indexOf('case "install"'),
    );
    expect(stage).toMatch(/nothing can start it/);
  });

  it("does not run main on import, so tests get no stray plist", async () => {
    const source = await read();
    expect(source).toMatch(/process\.argv\[1\]\?\.endsWith\("launchd\.ts"\)/);
    // buildPlist is importable without side effects; this very file proves it.
    expect(buildPlist({ repoRoot: "/r", pnpmPath: "/p", nodeDir: "/n" })).toContain(
      "<plist",
    );
  });
});
