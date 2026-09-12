import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { personalitiesEnabled } from "~/lib/personalities/server/config";

import App from "./App";
import styles from "./personalities.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Personalities",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  if (!personalitiesEnabled()) notFound();
  return (
    <div className={styles.root}>
      <App />
      {children}
    </div>
  );
}
