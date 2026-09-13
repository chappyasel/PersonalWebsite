"use client";

import { roomResidency } from "../stacks/room/roomResidency";
import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";

import {
  VARIANTS,
  setPrototypeEnabled,
  useRouteTransitionPrototype,
} from "./store";

const Prototype = dynamic(() => import("./RouteTransitionPrototype"), {
  ssr: false,
});

export function RouteTransitionPrototypeGate() {
  const enabled = useRouteTransitionPrototype((state) => state.enabled);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const params = new URLSearchParams(window.location.search);
    const variant =
      VARIANTS.find((value) => value === params.get("variant")) ?? "origin";
    useRouteTransitionPrototype.setState({ enabled: true, variant });
  }, []);
  return enabled ? <Prototype /> : null;
}

export function RouteTransitionPrototypeControl() {
  const reverseRoom = useRouteTransitionPrototype((state) => state.reverseRoom);
  const keepRoom = useSyncExternalStore(
    roomResidency.subscribe,
    () => roomResidency.getSnapshot().enabled,
    () => true,
  );
  const enabled = useRouteTransitionPrototype((state) => state.enabled);
  return (
    <fieldset className="stacks-diagnostics-section">
      <legend>Page transitions</legend>
      <label className="stacks-diagnostics-control">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setPrototypeEnabled(event.currentTarget.checked)}
        />{" "}
        Animate page and document changes
      </label>
      <small>
        Open pages and documents from the clicked link or object. Enabled by
        default; resets on reload.
      </small>
      <label className="stacks-diagnostics-control">
        <input
          type="checkbox"
          checked={reverseRoom}
          onChange={(event) =>
            useRouteTransitionPrototype.setState({
              reverseRoom: event.currentTarget.checked,
            })
          }
        />{" "}
        Retrace the room entry point
      </label>
      <small>
        Zoom out on return, including browser Back. Resets on reload.
      </small>
      <label className="stacks-diagnostics-control">
        <input
          type="checkbox"
          checked={keepRoom}
          onChange={(event) =>
            roomResidency.setEnabled(event.currentTarget.checked)
          }
        />{" "}
        Keep the room ready briefly
      </label>
      <small>
        Pause the room for up to three minutes after leaving. Resets on reload.
      </small>
    </fieldset>
  );
}
