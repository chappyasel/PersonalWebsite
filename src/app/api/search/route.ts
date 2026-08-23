import { type NextRequest } from "next/server";

import {
  DAD_ACCESS_COOKIE_NAME,
  isValidDadAccessToken,
} from "~/lib/dad/access";
import { searchBooks } from "~/lib/universal-search/server/books";
import { searchDadIndex } from "~/lib/universal-search/server/dad-index";
import {
  type ServerSearchDependencies,
  createSearchResponse,
} from "~/lib/universal-search/server/search";
import { searchWeightliftingExercises } from "~/lib/universal-search/server/weightlifting";

import { env } from "~/env";

export const dynamic = "force-dynamic";
export const maxDuration = 3;

const providers: ServerSearchDependencies = {
  books: (query, context) =>
    searchBooks(query, {
      location: context.location,
      signal: context.signal,
    }),
  weightlifting: (query, context) =>
    searchWeightliftingExercises(query, {
      location: context.location,
      signal: context.signal,
    }),
  dad: (query, context) =>
    searchDadIndex(query, {
      location: context.location,
      signal: context.signal,
    }),
};

export function GET(request: NextRequest) {
  const dadToken = request.cookies.get(DAD_ACCESS_COOKIE_NAME)?.value;
  const dadAuthorized = isValidDadAccessToken(
    dadToken,
    env.DAD_CONTENT_PASSWORD,
  );

  return createSearchResponse(request, providers, {
    dadAuthorized,
    onProviderError(group, error) {
      console.error(`Universal search provider failed: ${group}`, error);
    },
  });
}
