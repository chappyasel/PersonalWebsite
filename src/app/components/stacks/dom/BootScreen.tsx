"use client";

// A bookcase entrance, not a loading indicator.
//
// This is server-rendered so it is present on the first paint, before the
// WebGL bundle can report anything. Books arrive on a fixed CSS cadence that
// deliberately knows nothing about asset progress; after the final slot the
// cadence loops, so a slow connection never leaves a frozen half-full shelf.
// When the room is ready, the compositor panels in globals.css part and the
// small bookcase resolves into the real shelves behind it.

const BOOK_ROWS = [
  [
    { width: 13, height: 29, tone: 0 },
    { width: 10, height: 35, tone: 1 },
    { width: 17, height: 32, tone: 2 },
    { width: 11, height: 27, tone: 3 },
    { width: 15, height: 37, tone: 0 },
    { width: 12, height: 31, tone: 2 },
    { width: 16, height: 34, tone: 1 },
  ],
  [
    { width: 16, height: 34, tone: 2 },
    { width: 11, height: 28, tone: 0 },
    { width: 14, height: 37, tone: 3 },
    { width: 12, height: 31, tone: 1 },
    { width: 17, height: 35, tone: 2 },
    { width: 10, height: 29, tone: 0 },
    { width: 13, height: 33, tone: 3 },
  ],
  [
    { width: 11, height: 31, tone: 1 },
    { width: 16, height: 36, tone: 3 },
    { width: 13, height: 28, tone: 0 },
    { width: 17, height: 34, tone: 2 },
    { width: 10, height: 30, tone: 1 },
    { width: 15, height: 37, tone: 0 },
    { width: 12, height: 32, tone: 2 },
  ],
] as const;

export default function BootScreen() {
  let bookIndex = 0;

  return (
    <div className="stacks-boot" aria-hidden>
      <div className="stacks-boot-threshold">
        <div className="stacks-boot-entry">
          <p className="stacks-boot-wordmark">Chappy Asel</p>
          <div className="stacks-boot-bookcase">
            {BOOK_ROWS.map((books, row) => (
              <div className="stacks-boot-shelf" data-shelf={row} key={row}>
                <div className="stacks-boot-books">
                  {books.map((book, column) => {
                    const cadenceIndex = bookIndex++;
                    const cadenceDelay = (
                      0.3 +
                      cadenceIndex * 0.3
                    ).toFixed(1);
                    return (
                      <span
                        className="stacks-boot-book"
                        data-book=""
                        data-tone={book.tone}
                        key={column}
                        style={
                          {
                            width: book.width,
                            height: book.height,
                            "--book-delay": `${cadenceDelay}s`,
                          } as React.CSSProperties
                        }
                      />
                    );
                  })}
                </div>
                <span className="stacks-boot-plank" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
