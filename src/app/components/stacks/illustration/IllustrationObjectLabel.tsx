"use client";

import { getPanelFraming } from "../store";
import { ArrowSquareOutIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useRef } from "react";

import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "~/components/ui/popover";

import { illustrationInteraction } from "./illustrationInteraction";
import type { IllustrationLabel } from "./illustrationLabels";

/** Hover and keyboard hints share the touch preview's glass and placement.
 * A touch selects first; a second tap or the label's action opens the destination. */
export function IllustrationObjectLabel({
  label,
  style,
  open,
  onOpenChange,
  onActivate,
}: {
  label: IllustrationLabel;
  style: CSSProperties;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivate: (label: IllustrationLabel, origin: HTMLElement) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef({
    type: "mouse",
    x: 0,
    y: 0,
    cancelled: false,
    pressed: false,
  });
  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelTimer, []);
  const activate = () => {
    if (!label.action || !trigger.current || illustrationInteraction.moving)
      return;
    onActivate(label, trigger.current);
    onOpenChange(false);
  };
  const contents = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="break-words text-[15px] font-semibold">
          {label.title}
        </span>
        {label.detail?.map((line) => (
          <span
            key={line}
            className="mt-0.5 break-words text-[13px] leading-[1.3] text-white/60"
          >
            {line}
          </span>
        ))}
        {label.action && (
          <span data-portal-action className="mt-1 text-[13px] leading-[1.3]">
            {label.action}
          </span>
        )}
      </span>
      {label.action &&
        (label.external ? (
          <ArrowSquareOutIcon aria-hidden size={15} className="shrink-0" />
        ) : (
          <ArrowsOutIcon aria-hidden size={15} className="shrink-0" />
        ))}
    </>
  );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <Button
          ref={trigger}
          variant="ghost"
          aria-label={label.title}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-illustration-object={label.id}
          className="room-illustration-hotspot"
          style={style}
          onPointerEnter={(event) => {
            cancelTimer();
            pointer.current.type = event.pointerType;
            if (event.pointerType === "touch") return;
            timer.current = setTimeout(() => {
              if (!illustrationInteraction.moving) onOpenChange(true);
            }, 350);
          }}
          onPointerLeave={() => {
            cancelTimer();
            if (pointer.current.type !== "touch")
              timer.current = setTimeout(() => onOpenChange(false), 180);
          }}
          onFocus={(event) => {
            if (
              pointer.current.type !== "touch" ||
              (!pointer.current.pressed &&
                event.currentTarget.matches(":focus-visible"))
            )
              onOpenChange(true);
          }}
          onKeyDown={() => {
            pointer.current.type = "keyboard";
          }}
          onPointerDown={(event) => {
            cancelTimer();
            pointer.current = {
              type: event.pointerType,
              x: event.clientX,
              y: event.clientY,
              cancelled: false,
              pressed: true,
            };
          }}
          onPointerUp={() => {
            pointer.current.pressed = false;
          }}
          onPointerMove={(event) => {
            if (
              event.buttons &&
              Math.hypot(
                event.clientX - pointer.current.x,
                event.clientY - pointer.current.y,
              ) > 8
            ) {
              pointer.current.cancelled = true;
              cancelTimer();
              onOpenChange(false);
            }
          }}
          onPointerCancel={() => {
            pointer.current.cancelled = true;
            pointer.current.pressed = false;
            cancelTimer();
            onOpenChange(false);
          }}
          onClick={(event) => {
            if (
              illustrationInteraction.moving ||
              (event.detail !== 0 && pointer.current.cancelled)
            )
              return;
            if (pointer.current.type === "touch" && !open) onOpenChange(true);
            else if (label.action) activate();
            else onOpenChange(!open);
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        aria-label={label.title}
        side="top"
        sideOffset={10}
        collisionPadding={{
          top: 16,
          left: 16,
          right: 16,
          bottom:
            typeof window !== "undefined" && window.innerWidth < 1200
              ? Math.max(
                  16,
                  window.innerHeight * (getPanelFraming()?.coverage ?? 0) + 16,
                )
              : 16,
        }}
        className="field-notes-glass-tooltip room-illustration-object-label z-30 w-max max-w-[240px] rounded-2xl px-3.5 py-2.5 font-serif text-sm leading-[1.25]"
        onInteractOutside={(event) => {
          if (
            event.target instanceof Node &&
            trigger.current?.contains(event.target)
          )
            event.preventDefault();
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={cancelTimer}
        onPointerLeave={() => {
          if (pointer.current.type !== "touch") onOpenChange(false);
        }}
      >
        {label.action ? (
          <Button
            variant="ghost"
            onClick={activate}
            className="relative flex h-auto min-h-11 w-full items-center justify-center gap-2 whitespace-normal rounded-none border-0 bg-transparent p-0 text-left font-serif font-normal text-inherit hover:bg-transparent hover:text-inherit"
          >
            {contents}
          </Button>
        ) : (
          <div className="flex items-center gap-2">{contents}</div>
        )}
      </PopoverContent>
    </Popover>
  );
}
