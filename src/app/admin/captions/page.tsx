import { notFound } from "next/navigation";

import { loadCaptionEditorSnapshot } from "~/lib/stacks/captionEditorData";

import { CaptionEditor } from "./CaptionEditor";
import { saveCaptionEdits } from "./actions";

export const metadata = {
  title: "Caption Editor",
  robots: { index: false, follow: false },
};

export default async function CaptionEditorPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const snapshot = await loadCaptionEditorSnapshot();
  return <CaptionEditor initialSnapshot={snapshot} saveAction={saveCaptionEdits} />;
}
