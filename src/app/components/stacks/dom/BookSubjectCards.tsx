import Link from "next/link";

import { getTagColor, getTagIcon } from "~/lib/books/tagColors";
import type { HomepageBookPlacard } from "~/lib/books/types";

import { Card } from "~/components/ui/card";

import styles from "./BookSubjectCards.module.css";

export function BookSubjectCards({
  subjects,
  libraryHref,
}: {
  subjects: HomepageBookPlacard["subjects"];
  libraryHref: string;
}) {
  const topSubjects = subjects.slice(0, 8);
  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {topSubjects.map((subject) => {
          const colors = getTagColor(subject.name);
          const Icon = getTagIcon(subject.name);
          const query = new URLSearchParams({ tags: subject.name });
          return (
            <Link
              key={subject.name}
              href={`${libraryHref}/?${query.toString()}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Browse ${subject.name}: ${subject.count} ${subject.count === 1 ? "book" : "books"}`}
              className={styles.link}
            >
              <Card
                data-placard-media-highlight="raised"
                className={`${styles.card} border-0`}
                style={{
                  backgroundColor: `color-mix(in srgb, ${colors.bg} 65%, transparent)`,
                  color: `color-mix(in srgb, hsl(var(--foreground)) 75%, ${colors.fg})`,
                }}
              >
                <div className={styles.top}>
                  <Icon
                    aria-hidden
                    weight="duotone"
                    className={styles.icon}
                    style={{ color: colors.fg }}
                  />
                  <span className={styles.count}>
                    {subject.count}
                    <span>{subject.count === 1 ? "book" : "books"}</span>
                  </span>
                </div>
                <span className={styles.title}>{subject.name}</span>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
