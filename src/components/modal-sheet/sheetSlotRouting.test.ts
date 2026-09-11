import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";
import { existsSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

it("clears the document sheet slot on navigation to the homepage as well as other pages", () => {
  const segments = readdirSync(new URL("../../app/@sheet/", import.meta.url));
  const dismissRoute = segments.find((segment) =>
    segment.includes("catchAll"),
  )!;
  const routes = [
    `/${dismissRoute}`,
    ...(segments.includes("page.tsx") ? ["/"] : []),
  ];
  const matches = routes.map((route) => getRouteMatcher(getRouteRegex(route)));
  expect(
    matches.some((match) => match("/")),
    "the homepage must resolve the empty sheet route",
  ).toBe(true);
  expect(matches.some((match) => match("/books"))).toBe(true);
});

it("lets document navigation suspend instead of committing an intermediate loading screen", () => {
  for (const document of ["manual", "routine", "systems"]) {
    expect(
      existsSync(
        new URL(`../../app/@sheet/(.)${document}/loading.tsx`, import.meta.url),
      ),
    ).toBe(false);
  }
});
