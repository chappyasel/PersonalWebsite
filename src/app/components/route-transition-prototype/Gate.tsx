"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

import { Switch } from "~/components/ui/switch";

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
  const enabled = useRouteTransitionPrototype((state) => state.enabled);
  return (
    <fieldset className="stacks-diagnostics-section">
      <legend>Page transitions</legend>
      <label className="flex items-center justify-between gap-3">
        Animate major page changes
        <Switch checked={enabled} onCheckedChange={setPrototypeEnabled} />
      </label>
      <small>
        Open pages from the clicked link or object. Enabled by default; resets
        on reload.
      </small>
    </fieldset>
  );
}
