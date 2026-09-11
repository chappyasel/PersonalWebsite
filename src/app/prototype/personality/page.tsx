import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";

import PersonalityPrototype from "./PersonalityPrototype";
import { type Snapshot } from "./model";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Personality curves prototype",
  robots: { index: false, follow: false },
};

export default async function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  const data = JSON.parse(
    await readFile(
      path.join(process.cwd(), "data/personality-prototype/snapshot.json"),
      "utf8",
    ),
  ) as Snapshot;
  return <PersonalityPrototype data={data} />;
}
