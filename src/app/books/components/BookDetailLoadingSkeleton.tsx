const NOTE_LINE_WIDTHS = ["92%", "100%", "86%", "96%", "78%", "90%"];

function NoteLines({ sets = 2 }: { sets?: number }) {
  return (
    <div className="space-y-8">
      {Array.from({ length: sets }).map((_, setIndex) => (
        <div key={setIndex} className="space-y-3">
          <div className="h-6 w-2/5 animate-pulse rounded-md bg-muted-foreground/15" />
          {NOTE_LINE_WIDTHS.map((width, lineIndex) => (
            <div
              key={lineIndex}
              className="h-3.5 animate-pulse rounded bg-muted-foreground/10"
              style={{ width }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full book-detail geometry for the interval before even preview data exists. */
export function BookDetailLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading book details"
      aria-busy="true"
      data-book-detail-skeleton=""
      className="h-full overflow-hidden bg-background dark:bg-muted"
    >
      <span className="sr-only">Loading book details</span>
      <div
        aria-hidden="true"
        className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden px-6 pb-10 pt-8 xs:px-14 md:pt-14"
      >
        <div className="flex items-start gap-5 md:gap-8">
          <div className="h-[220px] w-[147px] shrink-0 animate-pulse rounded-xl bg-muted-foreground/15 md:h-[300px] md:w-[200px]" />
          <div className="min-w-0 flex-1 space-y-4 pt-1 md:pt-3">
            <div className="h-3 w-28 animate-pulse rounded bg-muted-foreground/10" />
            <div className="h-9 w-4/5 animate-pulse rounded-md bg-muted-foreground/15" />
            <div className="h-5 w-2/5 animate-pulse rounded bg-muted-foreground/10" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/10" />
            <div className="hidden space-y-2 pt-3 sm:block">
              <div className="h-3.5 w-44 animate-pulse rounded bg-muted-foreground/10" />
              <div className="h-3.5 w-52 animate-pulse rounded bg-muted-foreground/10" />
              <div className="flex gap-2 pt-2">
                <div className="h-7 w-20 animate-pulse rounded-full bg-muted-foreground/10" />
                <div className="h-7 w-24 animate-pulse rounded-full bg-muted-foreground/10" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-10 min-h-0 flex-1 overflow-hidden border-t border-foreground/10 pt-8">
          <NoteLines sets={3} />
        </div>
      </div>
    </div>
  );
}

/** Notes-shaped continuation used when preview metadata is already visible. */
export function BookNotesLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading book notes"
      aria-busy="true"
      data-book-notes-skeleton=""
      className="min-h-[50vh] py-8"
    >
      <span className="sr-only">Loading book notes</span>
      <div aria-hidden="true" className="mx-auto max-w-3xl">
        <NoteLines />
      </div>
    </div>
  );
}
