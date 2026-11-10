import { OwnerPage, type SearchParams } from "./ownerPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The owner's Weight Log editor: the weekly table. Owner only. */
export default function WeightLogEditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return OwnerPage({ searchParams, view: "weeks" });
}
