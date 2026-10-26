/**
 * The install details the setup page publishes. The iOS app's Settings
 * sheet and the MCP server's own error message link here, and the npm
 * package and the Claude Desktop extension use the same server name, so
 * every value below has to match what they ship.
 */

/** Where the page lives. The app links /weightlifting/ai, which redirects here. */
export const SETUP_PAGE_PATH = "/weightliftingapp/ai";

export const MCP_SERVER_NAME = "weightlifting-app";
export const MCP_PACKAGE = "weightlifting-app-mcp";
export const NPM_PACKAGE_URL = `https://www.npmjs.com/package/${MCP_PACKAGE}`;

/** The Claude Desktop extension, served from public/downloads. */
export const CLAUDE_DESKTOP_EXTENSION_PATH =
  "/downloads/weightlifting-app.mcpb";

/** The file the app's Export all data writes. */
export const EXPORT_FILE_NAME = "WeightliftingAppData.wld";
export const EXAMPLE_EXPORT_PATH = `~/Documents/${EXPORT_FILE_NAME}`;

/** How an MCP client launches the server: no arguments reads iCloud Drive. */
export const MCP_SERVER_CONFIG = {
  command: "npx",
  args: ["-y", MCP_PACKAGE],
};

/**
 * `exportPath` points the server at a saved Export instead of iCloud Drive.
 * User scope loads it in every folder; Claude Code's default, local scope,
 * loads it only in the folder where the command ran.
 */
export function claudeCodeCommand(exportPath?: string) {
  const launch = [MCP_SERVER_CONFIG.command, ...MCP_SERVER_CONFIG.args];
  if (exportPath) launch.push(exportPath);
  return `claude mcp add --scope user ${MCP_SERVER_NAME} -- ${launch.join(" ")}`;
}

/**
 * Cursor's MCP install deeplink: the server name, and the server's config
 * (without the name) as base64 JSON, unescaped as in Cursor's own example.
 * https://cursor.com/docs/context/mcp/install-links
 */
export function cursorInstallLink() {
  const config = btoa(JSON.stringify(MCP_SERVER_CONFIG));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${config}`;
}
