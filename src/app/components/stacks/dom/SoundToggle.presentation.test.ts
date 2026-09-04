import fs from "node:fs";
import { describe, expect, it } from "vitest";

const chrome = fs.readFileSync(
  new URL("./ChromeLayer.tsx", import.meta.url),
  "utf8",
);
const toggle = fs.readFileSync(
  new URL("./SoundToggle.tsx", import.meta.url),
  "utf8",
);
const canvas = fs.readFileSync(
  new URL("../StacksCanvas.tsx", import.meta.url),
  "utf8",
);

describe("scene sound control", () => {
  it("shares the theme button treatment and reverses only its mobile order", () => {
    expect(chrome).toContain('className="stacks-scene-controls"');
    expect(chrome).toContain("<ThemeToggle");
    expect(chrome).toContain(
      'className="stacks-on-background-text stacks-mobile-secondary-chrome !rounded-full',
    );
    expect(chrome).toContain("<SoundToggle className=");
    expect(chrome).toContain("flex-direction: row-reverse");
    expect(chrome).toContain("flex-direction: row;");
    expect(toggle).toContain(
      "flex size-10 items-center justify-center rounded-md bg-transparent",
    );
    expect(toggle).toContain('className="h-4 w-4" weight="bold"');
  });

  it("persists mute state and controls the authoritative scene audio mix", () => {
    expect(toggle).toContain("SCENE_SOUND_STORAGE_KEY");
    expect(toggle).toContain("sceneAudio.subscribe(setAudio)");
    expect(toggle).toContain("sceneAudio.setMuted(next)");
    expect(toggle).toContain("sceneAudio.unlock()");
    expect(toggle).toContain('event.key.toLowerCase() !== "m"');
    expect(toggle).toContain("isEditableShortcutTarget(event.target)");
    expect(toggle).toContain(
      "aria-pressed={audio.unlocked ? muted : undefined}",
    );
    expect(canvas).toContain('closest("[data-sound-toggle]")');
  });

  it("presents locked audio as an enable action until Web Audio is unlocked", () => {
    expect(toggle).toContain(
      "const awaitingEnable = !audio.unlocked && !muted",
    );
    expect(toggle).toContain('"Enable scene sound"');
    expect(toggle).toContain("SpeakerNoneIcon");
    expect(toggle).toContain('awaitingEnable ? "locked"');
    expect(toggle).toContain("if (awaitingEnable)");
  });
});
