"use client";

import { sceneAudio } from "../audio/sceneAudio";
import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
import { SCENE_SOUND_STORAGE_KEY } from "../scene/sceneVisitStorage";
import {
  SpeakerHighIcon,
  SpeakerNoneIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "~/lib/utils";

import { Keycap } from "~/components/ui/keycap";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export { SCENE_SOUND_STORAGE_KEY } from "../scene/sceneVisitStorage";

export function SoundToggle({ className }: { className?: string }) {
  const [audio, setAudio] = useState(sceneAudio.snapshot);
  const [mounted, setMounted] = useState(false);

  const toggleMute = useCallback(() => {
    const next = !sceneAudio.snapshot().muted;
    sceneAudio.setMuted(next);
    if (!next) sceneAudio.unlock();
    try {
      window.localStorage.setItem(SCENE_SOUND_STORAGE_KEY, String(next));
    } catch {
      // Session state remains authoritative when persistence is unavailable.
    }
  }, []);

  useEffect(() => {
    const unsubscribe = sceneAudio.subscribe(setAudio);
    setMounted(true);
    try {
      sceneAudio.setMuted(
        window.localStorage.getItem(SCENE_SOUND_STORAGE_KEY) === "true",
      );
    } catch {
      // A blocked storage API should not disable this session's control.
    }
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onMuteShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "m" ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        event.defaultPrevented ||
        isEditableShortcutTarget(event.target)
      )
        return;
      event.preventDefault();
      toggleMute();
    };
    window.addEventListener("keydown", onMuteShortcut);
    return () => window.removeEventListener("keydown", onMuteShortcut);
  }, [toggleMute]);

  if (!mounted) return <div className="size-10 rounded-md bg-transparent" />;

  const muted = audio.muted;
  const awaitingEnable = !audio.unlocked && !muted;
  const Icon = muted
    ? SpeakerSlashIcon
    : awaitingEnable
      ? SpeakerNoneIcon
      : SpeakerHighIcon;
  const action = muted
    ? "Turn scene sound on"
    : awaitingEnable
      ? "Enable scene sound"
      : "Mute scene sound";

  const toggle = () => {
    if (awaitingEnable) {
      sceneAudio.unlock();
      return;
    }
    // The button click is an autoplay-safe user gesture. `toggleMute` unlocks
    // only when enabling; choosing mute never initializes or downloads audio.
    toggleMute();
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggle}
            aria-label={action}
            aria-pressed={audio.unlocked ? muted : undefined}
            className={cn(
              "flex size-10 items-center justify-center rounded-md bg-transparent text-sm text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              className,
            )}
            data-sound-toggle
            data-sound-state={
              awaitingEnable ? "locked" : muted ? "muted" : "playing"
            }
            data-muted={muted ? true : undefined}
          >
            <Icon className="h-4 w-4" weight="bold" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="flex items-center gap-1.5">
            <span>{action}</span>
            <Keycap aria-hidden="true">M</Keycap>
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
