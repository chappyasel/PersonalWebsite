"use client";

import { worldBoot } from "../boot/worldBootSession";
import { sceneHash } from "../data";
import { useStacks } from "../store";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { roomResidency } from "./roomResidency";

/** The route leases the shared room. Its server-rendered flat document stays
 * crawlable; hydration hands presentation to the persistent layout host. */
export function ResidentRoom({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const [attached, setAttached] = useState(false);
  const content = useRef(children);
  content.current = children;
  const owner = useRef(Symbol("homepage room"));
  useLayoutEffect(() => {
    const token = owner.current;
    roomResidency.enter(token, content.current);
    setAttached(true);
    return () => {
      const state = useStacks.getState();
      const hash = sceneHash(state.activeUnit, state.golfStop);
      const scope = worldBoot.scope();
      roomResidency.leave(token, worldBoot.getView().revealed, hash, () =>
        scope.send({ type: "exit" }),
      );
    };
  }, []);
  useLayoutEffect(() => {
    roomResidency.update(owner.current, children);
  }, [children]);
  return attached ? null : fallback;
}
