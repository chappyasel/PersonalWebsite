"use client";

import { type ReactNode } from "react";

import ModalSheet from "~/components/modal-sheet/ModalSheet";

import { useStacks } from "~/app/components/stacks/store";

/**
 * The routine/manual documents in the shared sheet chrome, wired to the 3D
 * world: while the sheet is present the world's scroll rig stands down and
 * the placards suspend (modalOpen is the book modal's own stand-down signal;
 * ScrollBridges bails on it, PlacardLayer suspends on it). On non-world
 * pages nothing subscribes and the flag is inert. The page's own theme
 * toggle is hidden in here (daylight.css keys on .dl-sheet) — the corner
 * belongs to the sheet's cluster and the theme follows the scene beneath.
 */
export default function DaylightSheet({
  label,
  expandHref,
  children,
}: {
  label: string;
  expandHref: string;
  children: ReactNode;
}) {
  return (
    <ModalSheet
      label={label}
      expandHref={expandHref}
      className="dl-sheet"
      onPresenceChange={(present) =>
        useStacks.getState().setModalOpen(present)
      }
    >
      {children}
    </ModalSheet>
  );
}
