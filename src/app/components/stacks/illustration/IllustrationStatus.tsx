"use client";

import { BootWaitNotes } from "../dom/BootScreen";
import { type CSSProperties, useEffect } from "react";

import { startLoadingNotice } from "./startLoadingNotice";

/** Keep the loading heading still while the existing stage notes rotate. */
export function IllustrationStatus({
  loading,
  firstPaint = false,
  active = true,
}: {
  loading: boolean;
  firstPaint?: boolean;
  active?: boolean;
}) {
  useEffect(() => {
    if (loading && active) startLoadingNotice();
  }, [loading, active]);
  return (
    <div
      className="room-illustration-status"
      data-illustration-status={loading ? "loading" : "fallback"}
      role="status"
      aria-label="Room view"
      aria-live="polite"
      aria-atomic="true"
    >
      {loading ? (
        <>
          <span className="room-loading-heading">
            Loading 3D
            <span className="stacks-boot-wait-dots" aria-hidden>
              {[0, 1, 2].map((dot) => (
                <span
                  className="stacks-boot-wait-dot"
                  key={dot}
                  style={
                    {
                      "--stacks-boot-dot-delay": `${dot * 0.18}s`,
                    } as CSSProperties
                  }
                >
                  .
                </span>
              ))}
            </span>
          </span>
          <div aria-hidden>
            <BootWaitNotes active={active && !firstPaint} />
          </div>
        </>
      ) : (
        <span>2D view</span>
      )}
    </div>
  );
}
