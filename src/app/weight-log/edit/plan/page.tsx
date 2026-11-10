import { OwnerPage, type SearchParams } from "../ownerPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The running phase's plan: its length, and starting a new phase. Owner only. */
export default function WeightLogPlanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return OwnerPage({ searchParams, view: "plan" });
}
