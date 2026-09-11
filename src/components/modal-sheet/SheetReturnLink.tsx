"use client";

import Link from "next/link";
import { type ComponentProps, useContext } from "react";

import { ModalSheetDismissContext } from "./ModalSheet";

/** A full page navigates normally; an expanded sheet closes its existing
 * presentation instead of pushing another copy of the page underneath. */
export default function SheetReturnLink(props: ComponentProps<typeof Link>) {
  const dismiss = useContext(ModalSheetDismissContext);
  return (
    <Link
      {...props}
      data-route-transition={dismiss ? "preserve" : undefined}
      onClick={(event) => {
        props.onClick?.(event);
        if (
          !dismiss ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== "_self") ||
          (props.download !== undefined && props.download !== false)
        )
          return;
        event.preventDefault();
        dismiss();
      }}
    />
  );
}
