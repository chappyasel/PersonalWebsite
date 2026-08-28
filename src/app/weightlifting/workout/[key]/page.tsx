import { type Metadata } from "next";

import { ordinalDate } from "../../lib/wlaFormat";
import { workoutPreviewTarget } from "../../lib/workoutKey";
import { WlBackLink } from "../../components/WlBackLink";
import { WorkoutPreview } from "../../components/WorkoutPreview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const target = workoutPreviewTarget(key);
  const title =
    "date" in target
      ? `Workouts · ${ordinalDate(target.date)} ~ Chappy's Weightlifting`
      : "Workout ~ Chappy's Weightlifting";
  return {
    title,
    alternates: { canonical: `/workout/${key}` },
    openGraph: { title, url: `/workout/${key}` },
    twitter: { card: "summary_large_image", title },
  };
}

/** The workout preview as a real page: where a shared link lands, and the
 * expand target of the intercepted card sheet. */
export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return (
    <div className="mx-auto max-w-[27.5rem] space-y-3 font-sans">
      <WlBackLink />
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <WorkoutPreview target={workoutPreviewTarget(key)} />
      </div>
    </div>
  );
}
