"use client";

import Link from "next/link";
import { useEffect } from "react";

import { reportClientError } from "~/lib/error-reporting/client";

import { Button } from "~/components/ui/button";

import { MeetMessage } from "./MeetMessage";
import styles from "./meet.module.css";

/** Any /meet page that fails, in the booking page's look. */
export default function MeetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled /meet error:", error);
    reportClientError(error, {
      source: "boundary",
      label: "meet",
      digest: error.digest,
    });
  }, [error]);

  return (
    <MeetMessage
      actions={
        <>
          <Button type="button" onClick={reset} className={styles.primary}>
            Try again
          </Button>
          <Button asChild className={styles.quiet}>
            <Link href="/">chappyasel.com</Link>
          </Button>
        </>
      }
    >
      This page didn&apos;t load. It&apos;s usually brief, so try again in a
      minute.
      {error.digest && (
        <span className={styles.errorId}> Error ID {error.digest}.</span>
      )}
    </MeetMessage>
  );
}
