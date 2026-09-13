"use client";

import { GOLF_STOP_POSITION, UNITS } from "../data";

import { ROOM_SECTION_PATHNAMES } from "~/lib/site/roomRoutes";

/** Serialize the scene registry across the server/client boundary. The script
 * runs before shelf markup, so hash destinations never paint About first. */
export function roomFirstPaintSelectionScript(initialUnit: number) {
  const slugs = Object.fromEntries<number>(
    UNITS.flatMap((unit, index) =>
      [unit.slug, unit.urlSlug, ...(unit.urlAliases ?? [])]
        .filter((slug): slug is string => Boolean(slug))
        .map((slug): [string, number] => [slug, index]),
    ),
  );
  const paths = Object.fromEntries(
    Object.entries(ROOM_SECTION_PATHNAMES).map(([slug, path]) => [
      path,
      slugs[slug],
    ]),
  );
  return `try{var roomSlugs=${JSON.stringify({ ...slugs, golf: GOLF_STOP_POSITION })};var roomPaths=${JSON.stringify({ ...paths, "/": 0, "/golf": GOLF_STOP_POSITION })};document.documentElement.setAttribute("data-room-first-unit",String((Object.hasOwn(roomSlugs,location.hash.slice(1))?roomSlugs[location.hash.slice(1)]:undefined)??roomPaths[location.pathname.replace(/\\/+$/,"")||"/"]??${initialUnit}));}catch(e){}`;
}

export function RoomFirstPaintSelection({
  initialUnit,
}: {
  initialUnit: number;
}) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: roomFirstPaintSelectionScript(initialUnit),
        }}
      />
      <style>
        {UNITS.map(
          (_, index) =>
            `html[data-room-first-unit="${index}"] .room-first-paint-unit[data-first-paint-unit="${index}"]{display:contents}`,
        ).join("\n")}
      </style>
    </>
  );
}
