"use client";

import { toBootReadingBooks } from "../boot/homepageReadingBooks";
import {
  GOLF_STOP_POSITION,
  type StacksData,
  type StacksSlots,
  UNITS,
} from "../data";
import Link from "next/link";
import type { CSSProperties } from "react";

import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

import { IllustrationStage } from "./IllustrationStage";
import { getRoomArtwork } from "./artwork/getRoomArtwork";
import "./roomDocument.css";

function DocumentArtwork({
  unitIndex,
  data,
}: {
  unitIndex: number;
  data?: StacksData;
}) {
  if (!getRoomArtwork(unitIndex, "light", "desktop"))
    return (
      <IllustrationStage
        unitIndex={unitIndex}
        readingBooks={data ? toBootReadingBooks(data.readingBooks) : undefined}
        readingBookColors={data?.readingBookColors}
      />
    );
  const variables: Record<string, string> = {};
  for (const theme of ["light", "dark"] as const)
    for (const viewport of ["desktop", "phone"] as const)
      variables[`--document-art-${theme}-${viewport}`] =
        `url("${getRoomArtwork(unitIndex, theme, viewport)!.src}")`;
  return (
    <div className="room-document-drawing" style={variables as CSSProperties} />
  );
}

/** The room without a JavaScript dependency. Native links select a drawing
 * and its server-rendered content; hydration replaces it with the same room. */
export default function RoomDocument({
  data,
  slots = {},
  initialUnit = 0,
}: {
  data?: StacksData;
  slots?: Partial<StacksSlots>;
  initialUnit?: number;
}) {
  const sections = [
    ...UNITS.map((unit, index) => ({
      ...unit,
      index,
      content: slots[unit.slug] ?? (
        <h1 className="font-serif text-3xl">{unit.label}</h1>
      ),
    })),
    {
      slug: "golf",
      label: "Golf",
      index: GOLF_STOP_POSITION,
      urlSlug: "golf",
      urlAliases: [],
      content: (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h1 className="font-serif text-3xl">A little time on the green.</h1>
            <p>The four-ball golf game is available in the 3D room.</p>
            <Button asChild variant="outline">
              <a href="#weightlifting">Explore Weightlifting</a>
            </Button>
          </CardContent>
        </Card>
      ),
    },
  ];
  return (
    <main className="room-document room-illustration" data-illustration-visible>
      <Link className="room-document-name" href="/" prefetch={false}>
        Chappy Asel
      </Link>
      <nav className="room-document-nav" aria-label="Room sections">
        {sections.map((section) => (
          <Button asChild variant="ghost" size="sm" key={section.slug}>
            <a href={`#${section.urlSlug ?? section.slug}`}>{section.label}</a>
          </Button>
        ))}
      </nav>
      {sections.map((section) => (
        <section
          className="room-document-section"
          id={section.urlSlug ?? section.slug}
          key={section.slug}
          aria-label={section.label}
          data-document-default={section.index === initialUnit ? "" : undefined}
        >
          {[section.slug, ...(section.urlAliases ?? [])]
            .filter((slug) => slug !== (section.urlSlug ?? section.slug))
            .map((slug) => (
              <span id={slug} key={slug} />
            ))}
          <div
            className="room-document-artwork"
            data-document-drawing={section.index}
            aria-hidden
          >
            <DocumentArtwork unitIndex={section.index} data={data} />
          </div>
          <div className="room-document-content">
            {section.content}
            {section.slug === "about" && slots.quotes}
          </div>
        </section>
      ))}
    </main>
  );
}
