import { SCENE_FOCUS_SESSION_KEY } from "../scene/sceneVisitStorage";

export const FOCUS_SESSION_KEY = SCENE_FOCUS_SESSION_KEY;

export function readFocusMode(storage: Pick<Storage, "getItem">) {
  return storage.getItem(FOCUS_SESSION_KEY) === "1";
}

export function writeFocusMode(
  storage: Pick<Storage, "setItem">,
  hidden: boolean,
) {
  storage.setItem(FOCUS_SESSION_KEY, hidden ? "1" : "0");
}
