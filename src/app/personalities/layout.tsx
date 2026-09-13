import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { personalitiesEnabled } from "~/lib/personalities/server/config";

import styles from "./personalities.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Personalities",
  description: "Big Five personality results and comparisons.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  if (!personalitiesEnabled()) notFound();
  return <div className={styles.root}>{children}</div>;
}
