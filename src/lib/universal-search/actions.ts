import type { FontOption } from "~/lib/font-provider";
import type { ThemeChoice } from "~/lib/theme";

import type { CommandActionId } from "./types";

type CommandActionDependencies = {
  setTheme: (theme: ThemeChoice) => void;
  setFont: (font: FontOption) => void;
  clearRecents: () => void;
};

export function runCommandAction(
  actionId: CommandActionId,
  dependencies: CommandActionDependencies,
) {
  switch (actionId) {
    case "theme-light":
      dependencies.setTheme("light");
      return;
    case "theme-dark":
      dependencies.setTheme("dark");
      return;
    case "theme-system":
      dependencies.setTheme("system");
      return;
    case "font-georgia":
      dependencies.setFont("georgia");
      return;
    case "font-literata":
      dependencies.setFont("literata");
      return;
    case "font-system":
      dependencies.setFont("system");
      return;
    case "recents-clear":
      dependencies.clearRecents();
  }
}
