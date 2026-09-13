import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const setupScript = fileURLToPath(
  new URL("../.superset/setup.sh", import.meta.url),
);
let root: string;
let checkout: string;
let workspace: string;

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}

function setup(cwd = workspace) {
  return spawnSync("bash", [path.join(cwd, ".superset/setup.sh")], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NVM_DIR: path.join(root, "nvm"),
      PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
    },
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "superset-setup-"));
  checkout = path.join(root, "primary checkout");
  workspace = path.join(root, "linked workspace");
  mkdirSync(path.join(checkout, ".superset"), { recursive: true });
  copyFileSync(setupScript, path.join(checkout, ".superset/setup.sh"));
  writeFileSync(path.join(checkout, ".nvmrc"), "24\n");
  writeFileSync(
    path.join(checkout, "package.json"),
    '{"packageManager":"pnpm@10.34.5"}\n',
  );
  git(checkout, "init", "-b", "prototype/review");
  git(checkout, "add", ".");
  git(
    checkout,
    "-c",
    "user.name=Setup test",
    "-c",
    "user.email=setup@example.test",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--no-gpg-sign",
    "-m",
    "Setup fixture",
  );
  git(checkout, "worktree", "add", "-b", "feature", workspace);
  // Keep real Git discovery and file copying; stub toolchain installation only.
  mkdirSync(path.join(root, "nvm"));
  writeFileSync(path.join(root, "nvm/nvm.sh"), "nvm() { return 0; }\n");
  mkdirSync(path.join(root, "bin"));
  writeFileSync(
    path.join(root, "bin/corepack"),
    '#!/usr/bin/env bash\nif [[ "$*" == "pnpm --version" ]]; then echo 10.34.5; fi\n',
    { mode: 0o755 },
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

it("copies env from the primary checkout without a main branch and can rerun", () => {
  writeFileSync(path.join(checkout, ".env"), "SETUP_FIXTURE=primary\n");
  const result = setup();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(readFileSync(path.join(workspace, ".env"), "utf8")).toBe(
    "SETUP_FIXTURE=primary\n",
  );
  writeFileSync(path.join(workspace, ".env"), "SETUP_FIXTURE=workspace\n");
  expect(setup().status).toBe(0);
  expect(readFileSync(path.join(workspace, ".env"), "utf8")).toBe(
    "SETUP_FIXTURE=workspace\n",
  );
  expect(setup(checkout).status).toBe(0);
});

it("does not use a linked worktree just because its branch is main", () => {
  const decoy = path.join(root, "other checkout");
  git(checkout, "worktree", "add", "-b", "main", decoy);
  writeFileSync(path.join(checkout, ".env"), "SETUP_FIXTURE=primary\n");
  writeFileSync(path.join(decoy, ".env"), "SETUP_FIXTURE=wrong\n");
  expect(setup().status).toBe(0);
  expect(readFileSync(path.join(workspace, ".env"), "utf8")).toBe(
    "SETUP_FIXTURE=primary\n",
  );
});

it.each([".env.local", ".env.development", ".env.development.local"])(
  "accepts %s as the only env file",
  (name) => {
    writeFileSync(path.join(checkout, name), "SETUP_FIXTURE=development\n");
    expect(setup().status).toBe(0);
    expect(readFileSync(path.join(workspace, name), "utf8")).toBe(
      "SETUP_FIXTURE=development\n",
    );
  },
);

it("still fails when neither checkout has development env files", () => {
  const result = setup();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "No development environment file is available after setup.",
  );
});
