import styles from "../meet.module.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PreviewSwitch } from "./PreviewSwitch";

export const metadata: Metadata = {
  title: "Confirmation preview",
  robots: { index: false, follow: false },
};

/** The confirmation, Pass, without booking: Replay plays it again.
 * Development only. */
export default function ConfirmedPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="meet-root">
      <main className={styles.main}>
        <PreviewSwitch />
      </main>
    </div>
  );
}
