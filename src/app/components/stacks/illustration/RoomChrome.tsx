import ChromeLayer from "../dom/ChromeLayer";

import { useTapFirstCapability } from "~/lib/useTapFirstCapability";

import { ThemeToggle } from "~/components/ui/theme-toggle";

/** Reading and theme selection remain available before scene controls can work. */
export function RoomChrome({
  illustrated,
  live,
  keepControls = false,
}: {
  illustrated: boolean;
  live: boolean;
  /** Manual 2D keeps help, Field Notes, and diagnostics reachable. */
  keepControls?: boolean;
}) {
  const tapFirst = useTapFirstCapability();
  const sceneControlsVisible = !illustrated || live || keepControls;
  return (
    <>
      <div
        data-room-scene-chrome=""
        className={sceneControlsVisible ? "contents" : "hidden"}
        hidden={!sceneControlsVisible}
        inert={!sceneControlsVisible}
        aria-hidden={!sceneControlsVisible}
      >
        <ChromeLayer />
      </div>
      {!sceneControlsVisible && (
        <div className="room-illustrated-chrome contents">
          <div
            data-tap-first={tapFirst || undefined}
            className="stacks-wordmark pointer-events-none absolute z-20"
          >
            <span className="room-wordmark-label stacks-mobile-secondary-chrome stacks-on-background-text whitespace-nowrap font-serif text-base tracking-tight text-foreground min-[1200px]:text-lg">
              Chappy Asel
            </span>
          </div>
          <div
            data-tap-first={tapFirst || undefined}
            className="stacks-theme-toggle pointer-events-auto absolute z-30"
          >
            <ThemeToggle className="stacks-on-background-text stacks-mobile-secondary-chrome !rounded-full hover:!bg-foreground/[0.09] active:!bg-foreground/[0.14]" />
          </div>
        </div>
      )}
    </>
  );
}
