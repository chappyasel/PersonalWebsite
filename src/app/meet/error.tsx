"use client";

import { useEffect } from "react";

import { reportClientError } from "~/lib/error-reporting/client";

import { HomeAction, MeetMessage } from "./MeetMessage";
import { PressButton } from "./PressButton";
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
      heading="This page didn't load."
      actions={
        <>
          <PressButton type="button" onClick={reset}>
            Try again
          </PressButton>
          <HomeAction />
        </>
      }
    >
      It&apos;s usually brief, so try again in a minute.
      {error.digest && (
        <span className={styles.errorId}> Error ID {error.digest}.</span>
      )}
    </MeetMessage>
  );
}
