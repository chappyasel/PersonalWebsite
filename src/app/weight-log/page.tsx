import Link from "next/link";

import { getWeightLog } from "~/lib/weight-log/data";

import { WeightLogDashboard } from "./WeightLogDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WeightLogPage() {
  try {
    const log = await getWeightLog();
    return <WeightLogDashboard log={log} />;
  } catch {
    return (
      <div className="mx-auto max-w-lg py-24">
        <h1 className="font-rounded text-3xl font-semibold">Weight Log</h1>
        <p role="status" className="mt-4 text-muted-foreground">
          The weight history is temporarily unavailable. Please try again later.
        </p>
        <Link
          href="/weight-log"
          prefetch={false}
          className="mt-6 inline-block underline"
        >
          Try again
        </Link>
      </div>
    );
  }
}
