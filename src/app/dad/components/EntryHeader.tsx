interface EntryFrontmatter {
  title?: string;
  date?: string;
  date_end?: string | null;
  age?: number;
  phase?: string;
  people?: string[];
  locations?: string[];
  themes?: string[];
  dad_mood?: string[];
  reader_mood?: string[];
  summary?: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatPhase(phase: string): string {
  return phase
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatMood(mood: string): string {
  return mood
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function EntryHeader({
  frontmatter,
}: {
  frontmatter: EntryFrontmatter;
}) {
  const {
    title,
    date,
    age,
    phase,
    people,
    locations,
    themes,
    dad_mood,
    summary,
  } = frontmatter;

  return (
    <header className="mb-8 text-center">
      {title && (
        <h1 className="mb-4 font-serif text-3xl font-light italic leading-snug tracking-wide text-foreground sm:text-4xl">
          {title}
        </h1>
      )}

      {/* Date, age, phase block */}
      {(date ?? age !== undefined ?? phase) && (
        <div className="mb-6 text-center">
          {date && (
            <time className="font-serif text-sm italic text-muted-foreground">
              {formatDate(date)}
            </time>
          )}
          {(age !== undefined || phase) && (
            <p className="mt-0.5 font-serif text-xs text-muted-foreground">
              {age !== undefined && `Age ${age}`}
              {age !== undefined && phase && " · "}
              {phase && formatPhase(phase)}
            </p>
          )}
        </div>
      )}

      {/* Summary as centered epigraph */}
      {summary && (
        <blockquote className="mb-8 text-center">
          <p className="font-serif text-base italic leading-relaxed text-muted-foreground">
            &ldquo;{summary}&rdquo;
          </p>
        </blockquote>
      )}

      {/* People and locations as quiet annotation */}
      {(people?.length ?? 0) + (locations?.length ?? 0) > 0 && (
        <p className="mb-3 text-xs italic text-muted-foreground">
          {people?.join(", ")}
          {(people?.length ?? 0) > 0 && (locations?.length ?? 0) > 0 && " · "}
          {locations?.map((loc) => `@${loc}`).join(", ")}
        </p>
      )}

      {/* Themes — no borders, no backgrounds */}
      {themes && themes.length > 0 && (
        <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
          {themes.join("  ·  ")}
        </p>
      )}

      {/* Moods */}
      {dad_mood && dad_mood.length > 0 && (
        <p className="mb-3 text-xs italic text-muted-foreground">
          Written in {dad_mood.map(formatMood).join(", ")}
        </p>
      )}

      {/* Ornamental separator */}
      <div className="my-8 flex items-center justify-center">
        <span className="font-serif text-lg text-muted-foreground/25">✦</span>
      </div>
    </header>
  );
}
