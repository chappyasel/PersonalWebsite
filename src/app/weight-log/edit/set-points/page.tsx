import { OwnerPage, type SearchParams } from "../ownerPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The set points the public chart draws as guides. Owner only. */
export default function WeightLogSetPointsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return OwnerPage({ searchParams, view: "set-points" });
}
