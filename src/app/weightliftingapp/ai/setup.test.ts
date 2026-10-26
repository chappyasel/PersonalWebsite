import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLAUDE_DESKTOP_EXTENSION_PATH,
  NPM_PACKAGE_URL,
  SETUP_PAGE_PATH,
  claudeCodeCommand,
  cursorInstallLink,
} from "./setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

// The iOS app, the npm README, and the Claude Desktop extension publish
// these same values, so a change here has to ship there too.
describe("AI setup install details", () => {
  it("adds the server to Claude Code in every folder under its published name", () => {
    expect(claudeCodeCommand()).toBe(
      "claude mcp add --scope user weightlifting-app -- npx -y weightlifting-app-mcp",
    );
    expect(claudeCodeCommand("~/Documents/WeightliftingAppData.wld")).toBe(
      "claude mcp add --scope user weightlifting-app -- npx -y weightlifting-app-mcp ~/Documents/WeightliftingAppData.wld",
    );
  });

  it("encodes the server config in Cursor's install deeplink", () => {
    const link = cursorInstallLink();
    expect(link).toBe(
      "cursor://anysphere.cursor-deeplink/mcp/install?name=weightlifting-app&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIndlaWdodGxpZnRpbmctYXBwLW1jcCJdfQ==",
    );
    // Cursor reads the query the way URL does, so a "+" in the base64
    // would arrive as a space. Decoding through URL catches that.
    const url = new URL(link);
    expect(url.protocol).toBe("cursor:");
    expect(url.searchParams.get("name")).toBe("weightlifting-app");
    expect(JSON.parse(atob(url.searchParams.get("config") ?? ""))).toEqual({
      command: "npx",
      args: ["-y", "weightlifting-app-mcp"],
    });
  });

  it("links the npm package and the Claude Desktop extension", () => {
    expect(NPM_PACKAGE_URL).toBe(
      "https://www.npmjs.com/package/weightlifting-app-mcp",
    );
    expect(CLAUDE_DESKTOP_EXTENSION_PATH).toBe(
      "/downloads/weightlifting-app.mcpb",
    );
  });

  it("redirects the address the app links to", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
    const { default: config } = await import("@/next.config.js");
    expect(await config.redirects?.()).toContainEqual({
      source: "/weightlifting/ai",
      destination: SETUP_PAGE_PATH,
      permanent: false,
    });
  });
});
