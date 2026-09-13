import { notFound } from "next/navigation";

import { Comparison } from "./Comparison";
import { comparisonSummary } from "./data";

export const metadata = {
  title: "Boot artwork comparison",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function BootComparisonPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Comparison initialSummary={await comparisonSummary()} />;
}
