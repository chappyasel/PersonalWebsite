import { type SearchParams } from "nuqs/server";

import { api, HydrateClient } from "~/trpc/server";
import { WeightliftingDashboard } from "./components/WeightliftingDashboard";
import { wlSearchParamsCache } from "./lib/searchParams";

export default async function WeightliftingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { exercises, year } = await wlSearchParamsCache.parse(searchParams);

  // Fire-and-forget: pending queries stream into the client-side cache via
  // HydrateClient, so the dashboard's first render needs no client fetches
  void api.weightlifting.getStats.prefetch();
  void api.weightlifting.getTopExercises.prefetch({ minSets: 10 });
  void api.weightlifting.getPersonalRecords.prefetch();
  void api.weightlifting.getSyncStatus.prefetch();
  void api.weightlifting.getCalendarData.prefetch({ year });
  // Guard hand-crafted URLs — tRPC input requires 1–20 exercises
  if (exercises.length > 0 && exercises.length <= 20) {
    void api.weightlifting.getStrengthProgression.prefetch({ exercises });
  }

  return (
    <HydrateClient>
      <WeightliftingDashboard />
    </HydrateClient>
  );
}
