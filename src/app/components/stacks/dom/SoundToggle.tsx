"use client";

import { sceneAudio } from "../audio/sceneAudio";
import { SCENE_SOUND_STORAGE_KEY } from "../scene/sceneVisitStorage";
import {
  SpeakerHighIcon,
  SpeakerNoneIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";

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
    const next = !muted;
    sceneAudio.setMuted(next);
    // The button click is an autoplay-safe user gesture. Unlock only when
    // enabling; choosing mute must never initialize or download audio.
    if (!next) sceneAudio.unlock();
    try {
      window.localStorage.setItem(SCENE_SOUND_STORAGE_KEY, String(next));
    } catch {
      // Session state remains authoritative when persistence is unavailable.
    }
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
          <p>{action}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
