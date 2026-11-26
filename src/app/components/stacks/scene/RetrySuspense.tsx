"use client";

import { assetLoadComplete } from "../boot/worldBootMachine";
import { useProgress } from "@react-three/drei";
import {
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Mount-time nudges per boundary. Loading-manager nudges are not counted:
 * each follows a load that finished. */
const MOUNT_NUDGES = 3;

function loadsSettled() {
  const { active, loaded, total, errors } = useProgress.getState();
  return (
    total === 0 ||
    assetLoadComplete({ active, loaded, total, errors: errors.length })
  );
}

/** A Suspense boundary that does not wait on React's retry to show itself.
 *
 * React shows a boundary whose promise has resolved through a retry, which
 * renders in 5 ms slices and never escalates. Behind the frame loop on a slow
 * CPU the slices are far apart: at 4x throttling the About shelf, its loads
 * done, took 5 to 17 s to appear (docs/plans/room-boot-speed.md). This
 * remounts a boundary still behind its fallback once the loads settle, and
 * once a frame after it mounts, for a promise that settles without the
 * loading manager (an empty texture list still suspends once). A state update
 * renders in one pass, and with its loads cached nothing suspends. A boundary
 * whose contents have committed is never remounted. */
export default function RetrySuspense({
  children,
  onCommit,
}: {
  children: ReactNode;
  onCommit?: () => void;
}) {
  const committed = useRef(false);
  const mountNudges = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(
    () =>
      useProgress.subscribe(() => {
        if (!committed.current && loadsSettled())
          setAttempt((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    if (committed.current || mountNudges.current >= MOUNT_NUDGES) return;
    const frame = requestAnimationFrame(() => {
      if (committed.current || !loadsSettled()) return;
      mountNudges.current += 1;
      setAttempt((value) => value + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [attempt]);

  return (
    <Suspense key={attempt} fallback={null}>
      {children}
      <Committed
        onCommit={() => {
          committed.current = true;
          onCommitRef.current?.();
        }}
      />
    </Suspense>
  );
}

/** Its layout effect runs when the boundary's contents commit, not while the
 * fallback shows. */
function Committed({ onCommit }: { onCommit: () => void }) {
  const ref = useRef(onCommit);
  ref.current = onCommit;
  useLayoutEffect(() => {
    ref.current();
  }, []);
  return null;
}
