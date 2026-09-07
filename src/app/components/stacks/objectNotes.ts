"use client";

// The scene's side of the object notes (see src/lib/stacks/objectNotes for the
// format and the pipeline). Fetched, never imported: the baked JSON is on the
// order of tens of KB and the homepage route budget is measured in hundreds of
// bytes, so it must not enter the first-load bundle. Nothing asks for it until
// a caption is actually needed, which today means the artifact inspector
// opening for the first time.
import { useEffect, useState } from "react";

import {
  type ObjectNote,
  indexObjectNotes,
  objectNoteFor,
} from "~/lib/stacks/objectNotes";

const SOURCE = "/data/scene-objects.json";

let cache: Record<string, ObjectNote> | null = null;
let inFlight: Promise<Record<string, ObjectNote>> | null = null;

export function loadObjectNotes(): Promise<Record<string, ObjectNote>> {
  if (cache) return Promise.resolve(cache);
  inFlight ??= fetch(SOURCE)
    .then((response) => (response.ok ? response.json() : []))
    .then((notes: ObjectNote[]) => {
      cache = indexObjectNotes(Array.isArray(notes) ? notes : []);
      return cache;
    })
    .catch(() => {
      // A caption is a nicety. A failed fetch leaves the inspector exactly as
      // it was before there were any captions at all.
      cache = {};
      return cache;
    });
  return inFlight;
}

/** The note for one object, once it has arrived. Null while loading, and null
 * for an object nobody has written about yet. */
export function useObjectNote(id: string | null): ObjectNote | null {
  const [index, setIndex] = useState(cache);

  useEffect(() => {
    if (!id || index) return;
    let live = true;
    void loadObjectNotes().then((loaded) => {
      if (live) setIndex(loaded);
    });
    return () => {
      live = false;
    };
  }, [id, index]);

  if (!id || !index) return null;
  return objectNoteFor(index, id);
}
