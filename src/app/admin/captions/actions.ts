"use server";

import {
  type CaptionEditorSaveInput,
  saveCaptionEditorSnapshot,
} from "~/lib/stacks/captionEditorData";

export async function saveCaptionEdits(input: CaptionEditorSaveInput) {
  if (process.env.NODE_ENV !== "development")
    throw new Error("Caption editing is only available in development");
  return saveCaptionEditorSnapshot(input);
}
