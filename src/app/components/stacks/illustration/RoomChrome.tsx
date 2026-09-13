import ChromeLayer from "../dom/ChromeLayer";

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
          <div className="stacks-wordmark pointer-events-none absolute z-20">
            <span className="stacks-on-background-text whitespace-nowrap font-serif text-base tracking-tight text-foreground min-[1200px]:text-lg">
              Chappy Asel
            </span>
          </div>
          <div className="stacks-theme-toggle pointer-events-auto absolute z-30">
            <ThemeToggle className="stacks-on-background-text !rounded-full hover:!bg-foreground/[0.09] active:!bg-foreground/[0.14]" />
          </div>
        </div>
      )}
    </>
  );
}
