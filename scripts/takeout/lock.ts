import * as fs from "fs";
import * as path from "path";

import { takeoutPaths } from "./config";

/** Shared by all checkouts using this runtime state, not tied to cwd.
 * Never expire a lock by age or PID: a killed parent may leave sync running.
 * After a crash, an operator must check for surviving children before removal.
 */
export function acquireRefreshLock(): () => void {
  const { lockDir } = takeoutPaths();
  fs.mkdirSync(path.dirname(lockDir), { recursive: true });
  try {
    fs.mkdirSync(lockDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("refresh_lock_busy");
    }
    throw error;
  }
  try {
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        cwd: process.cwd(),
      }),
    );
  } catch (error) {
    fs.rmSync(lockDir, { recursive: true, force: true });
    throw error;
  }
  return () => fs.rmSync(lockDir, { recursive: true, force: true });
}
